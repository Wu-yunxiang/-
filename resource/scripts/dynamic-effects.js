(() => {
    const STORAGE_KEY = "dynamicBackgroundEnabled";

    // 预计算常用数学常量
    const MATH_PI_2 = Math.PI * 2;
    const MATH_PI_HALF = Math.PI / 2;

    const DynamicBackground = (() => {
        let canvas, ctx, width = 0, height = 0;
        let animationId = null, lastTimestamp = 0, resizeRaf = null;
        let running = false;
        let particles = [];
        
        // 优化空间分区数据结构
        const spatialPartition = {
            grid: new Map(),
            cellX: new Float32Array(300), // 预分配数组，避免动态扩展
            cellY: new Float32Array(300)
        };

        // 指针状态对象 - 保持结构不变
        const pointer = { x: 0, y: 0, active: false, prevX: 0, prevY: 0, vx: 0, vy: 0, hasPrev: false };

        // 预计算CONFIG中的常量
        const CONFIG = {
            density: 0.00011 * 0.8 * 0.9 * 0.9,
            minParticles: Math.max(8, Math.round(130 * 0.8 * 0.9)),
            maxParticles: Math.max(16, Math.round(280 * 0.8 * 0.9)),
            friction: 0.045,
            drift: Math.round(33.8 * 1.2 * 100) / 100,
            speedLimit: Math.round(182 * 1.2),
            pointerRadius: 83,
            pointerStrength: 8000,
            pointerDirectPull: 0.28,
            pointerVelocitySet: 1.2,
            connectionDistance: Math.round(220 * 0.775 * Math.sqrt(0.9) * 0.9),
            connectionOpacity: 0.38,
            connectionWidth: 0.9 * 2 * 0.9 * 0.9,
            sizeRange: [Math.round(1.68 * 0.9 * 0.9 * 100) / 100, Math.round(5.04 * 0.9 * 0.9 * 100) / 100],
            wrapMargin: 0,
            colors: ["255, 211, 134", "118, 212, 255", "214, 174, 255", "255, 140, 170", "173, 255, 201"],
            twinkleSpeedRange: [0.5, 1.4]
        };

        // 预计算派生常量（避免每帧重复计算）
        const PRECOMPUTED = {
            maxSpeedSq: CONFIG.speedLimit * CONFIG.speedLimit,
            pointerRadiusSq: CONFIG.pointerRadius * CONFIG.pointerRadius,
            pointerFarRadius: CONFIG.pointerRadius * 0.6,
            pointerFarRadiusSq: (CONFIG.pointerRadius * 0.6) * (CONFIG.pointerRadius * 0.6),
            pointerMidRadiusSq: (CONFIG.pointerRadius * 0.35) * (CONFIG.pointerRadius * 0.35),
            pointerSnapRadius: Math.max(2, CONFIG.pointerRadius * 0.06),
            pointerSnapRadiusSq: Math.max(2, CONFIG.pointerRadius * 0.06) * Math.max(2, CONFIG.pointerRadius * 0.06),
            connectionDistanceSq: (Math.round(220 * 0.775 * Math.sqrt(0.9) * 0.9)) * (Math.round(220 * 0.775 * Math.sqrt(0.9) * 0.9)),
            cellSize: Math.round(220 * 0.775 * Math.sqrt(0.9) * 0.9) || 1
        };

        // 对象池优化 - 减少垃圾回收
        const particlePool = [];
        const tempVectors = { dx: 0, dy: 0, distanceSq: 0, distance: 0 };

        function init() {
            canvas = document.getElementById("dynamicBackground");
            if (!canvas) return;

            ctx = canvas.getContext("2d", { alpha: true });
            handleResize();
            adjustParticleCount(true);

            // 使用事件委托和被动监听器
            const passiveOpts = { passive: true };
            window.addEventListener("resize", scheduleResize, passiveOpts);
            window.addEventListener("pointermove", handlePointerMove, passiveOpts);
            window.addEventListener("pointerdown", handlePointerMove, passiveOpts);
            window.addEventListener("pointerleave", handlePointerLeave, passiveOpts);
            window.addEventListener("pointercancel", handlePointerLeave, passiveOpts);
            document.addEventListener("visibilitychange", handleVisibilityChange);

            if (isEnabled() && !document.hidden) {
                start();
            } else if (!isEnabled()) {
                canvas.style.display = "none";
            }
        }

        function scheduleResize() {
            if (resizeRaf) return;
            resizeRaf = requestAnimationFrame(() => {
                resizeRaf = null;
                handleResize();
                adjustParticleCount(false);
            });
        }

        function handleResize() {
            width = window.innerWidth;
            height = window.innerHeight;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.floor(width * dpr);
            canvas.height = Math.floor(height * dpr);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        function adjustParticleCount(resetPositions) {
            if (!width || !height) return;
            
            const target = clamp(Math.round(width * height * CONFIG.density), CONFIG.minParticles, CONFIG.maxParticles);
            
            if (resetPositions) {
                // 使用对象池创建粒子
                particles = [];
                for (let i = 0; i < target; i++) {
                    particles.push(createParticle());
                }
                return;
            }
            
            if (particles.length > target) {
                // 回收多余的粒子
                for (let i = target; i < particles.length; i++) {
                    recycleParticle(particles[i]);
                }
                particles.length = target;
            } else {
                while (particles.length < target) {
                    particles.push(createParticle());
                }
            }
        }

        function getParticleFromPool() {
            return particlePool.pop() || {};
        }

        function recycleParticle(particle) {
            particlePool.push(particle);
        }

        function createParticle() {
            const particle = getParticleFromPool();
            const angle = Math.random() * MATH_PI_2;
            const origSpeed = (Math.random() * CONFIG.speedLimit * 0.7) + (CONFIG.speedLimit * 0.25);
            const baseSpeed = origSpeed * 0.75;
            const [minSize, maxSize] = CONFIG.sizeRange;
            const color = CONFIG.colors[Math.floor(Math.random() * CONFIG.colors.length)];
            const baseAlpha = 0.45 + Math.random() * 0.4;

            // 直接赋值，避免对象扩展
            particle.x = Math.random() * width;
            particle.y = Math.random() * height;
            particle.vx = Math.cos(angle) * baseSpeed;
            particle.vy = Math.sin(angle) * baseSpeed;
            particle.baseSpeed = baseSpeed;
            particle.size = minSize + Math.random() * (maxSize - minSize);
            particle.jitter = Math.random() * 0.6 + 0.45;
            particle.color = color;
            particle.alpha = baseAlpha;
            particle.baseAlpha = baseAlpha;
            particle.twinklePhase = Math.random() * MATH_PI_2;
            particle.twinkleSpeed = CONFIG.twinkleSpeedRange[0] + Math.random() * (CONFIG.twinkleSpeedRange[1] - CONFIG.twinkleSpeedRange[0]);
            particle.glowIntensity = 6 + Math.random() * 8;

            return particle;
        }

        function update(delta) {
            const frictionFactor = 1 - CONFIG.friction * delta;

            // 优化指针速度计算
            if (pointer.active && pointer.hasPrev && delta > 0) {
                pointer.vx = (pointer.x - pointer.prevX) / delta;
                pointer.vy = (pointer.y - pointer.prevY) / delta;
            } else {
                pointer.vx *= 0.85;
                pointer.vy *= 0.85;
            }
            pointer.prevX = pointer.x;
            pointer.prevY = pointer.y;

            // 批量处理粒子更新
            for (let i = 0, len = particles.length; i < len; i++) {
                const particle = particles[i];
                let underInfluence = false;

                if (pointer.active) {
                    const dx = pointer.x - particle.x;
                    const dy = pointer.y - particle.y;
                    const distanceSq = dx * dx + dy * dy;

                    // 优化：只在远区添加随机漂移
                    if (distanceSq >= PRECOMPUTED.pointerFarRadiusSq) {
                        particle.vx += (Math.random() - 0.5) * CONFIG.drift * particle.jitter * delta;
                        particle.vy += (Math.random() - 0.5) * CONFIG.drift * particle.jitter * delta;
                    }

                    if (distanceSq > 0 && distanceSq < PRECOMPUTED.pointerRadiusSq) {
                        underInfluence = true;
                        const distance = Math.sqrt(distanceSq);
                        const influence = (CONFIG.pointerRadius - distance) / CONFIG.pointerRadius;
                        const invDistance = 1 / distance;
                        const dirX = dx * invDistance;
                        const dirY = dy * invDistance;

                        const desiredSpeed = Math.max(CONFIG.speedLimit * 0.5, CONFIG.speedLimit * 0.9);

                        if (distanceSq >= PRECOMPUTED.pointerMidRadiusSq) {
                            const impulse = CONFIG.pointerStrength * Math.pow(influence, 2.2) * 0.002;
                            particle.vx += dirX * impulse;
                            particle.vy += dirY * impulse;

                            const blend = 0.7 + 0.45 * Math.pow(influence, 1.4);
                            particle.vx = lerp(particle.vx, dirX * desiredSpeed, blend);
                            particle.vy = lerp(particle.vy, dirY * desiredSpeed, blend);

                            const pull = CONFIG.pointerDirectPull * Math.pow(influence, 1.1);
                            particle.x += dx * pull;
                            particle.y += dy * pull;
                        } else {
                            particle.x = lerp(particle.x, pointer.x, 0.95);
                            particle.y = lerp(particle.y, pointer.y, 0.95);

                            particle.vx = lerp(particle.vx, pointer.vx, 0.98);
                            particle.vy = lerp(particle.vy, pointer.vy, 0.98);

                            particle.vx *= 0.35;
                            particle.vy *= 0.35;

                            if (distanceSq < PRECOMPUTED.pointerSnapRadiusSq) {
                                particle.vx = 0;
                                particle.vy = 0;
                                particle.x = pointer.x;
                                particle.y = pointer.y;
                            }
                        }
                    }
                }

                particle.vx *= frictionFactor;
                particle.vy *= frictionFactor;

                if (!underInfluence) {
                    const currentV = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy) || 0.0001;
                    const targetSpeed = particle.baseSpeed || (CONFIG.speedLimit * 0.6);
                    const scale = targetSpeed / currentV;
                    particle.vx *= scale;
                    particle.vy *= scale;
                }

                const velocitySq = particle.vx * particle.vx + particle.vy * particle.vy;
                if (velocitySq > PRECOMPUTED.maxSpeedSq) {
                    const scale = CONFIG.speedLimit / Math.sqrt(velocitySq);
                    particle.vx *= scale;
                    particle.vy *= scale;
                }

                particle.x += particle.vx * delta;
                particle.y += particle.vy * delta;

                particle.twinklePhase += delta * particle.twinkleSpeed;
                particle.alpha = clamp(particle.baseAlpha + Math.sin(particle.twinklePhase) * 0.22, 0.2, 1);

                const margin = CONFIG.wrapMargin;
                if (particle.x < -margin) particle.x = width + margin;
                if (particle.x > width + margin) particle.x = -margin;
                if (particle.y < -margin) particle.y = height + margin;
                if (particle.y > height + margin) particle.y = -margin;
            }
        }

        function render() {
            ctx.clearRect(0, 0, width, height);

            // 批量设置Canvas状态
            ctx.lineWidth = CONFIG.connectionWidth;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            const grid = spatialPartition.grid;
            const cellXCache = spatialPartition.cellX;
            const cellYCache = spatialPartition.cellY;

            grid.clear();

            // 优化空间分区构建
            for (let i = 0, len = particles.length; i < len; i++) {
                const particle = particles[i];
                const cellX = Math.floor(particle.x / PRECOMPUTED.cellSize);
                const cellY = Math.floor(particle.y / PRECOMPUTED.cellSize);
                cellXCache[i] = cellX;
                cellYCache[i] = cellY;
                
                const key = `${cellX},${cellY}`;
                let bucket = grid.get(key);
                if (!bucket) {
                    bucket = [];
                    grid.set(key, bucket);
                }
                bucket.push(i);
            }

            // 优化连线渲染 - 减少Canvas状态改变
            let currentAlpha = -1;
            ctx.beginPath();

            for (let i = 0, len = particles.length; i < len; i++) {
                const a = particles[i];
                const baseCellX = cellXCache[i];
                const baseCellY = cellYCache[i];
                
                for (let offsetY = -1; offsetY <= 1; offsetY++) {
                    for (let offsetX = -1; offsetX <= 1; offsetX++) {
                        const neighborKey = `${baseCellX + offsetX},${baseCellY + offsetY}`;
                        const bucket = grid.get(neighborKey);
                        if (!bucket) continue;
                        
                        for (let k = 0, bucketLen = bucket.length; k < bucketLen; k++) {
                            const j = bucket[k];
                            if (j <= i) continue;
                            
                            const b = particles[j];
                            const dx = a.x - b.x;
                            const dy = a.y - b.y;
                            const distSq = dx * dx + dy * dy;
                            
                            if (distSq >= PRECOMPUTED.connectionDistanceSq) continue;
                            
                            const distance = Math.sqrt(distSq);
                            const connectionAlpha = CONFIG.connectionOpacity * (1 - distance / CONFIG.connectionDistance);
                            if (connectionAlpha <= 0) continue;
                            
                            const brightness = 0.6 + 0.4 * Math.min(a.alpha, b.alpha);
                            const finalAlpha = Math.min(1, connectionAlpha * brightness * 1.2);
                            
                            // 按透明度分组批量绘制
                            const alphaKey = Math.floor(finalAlpha * 10);
                            if (alphaKey !== currentAlpha) {
                                ctx.stroke();
                                ctx.beginPath();
                                ctx.strokeStyle = `rgba(180, 220, 255, ${finalAlpha})`;
                                currentAlpha = alphaKey;
                            }
                            
                            ctx.moveTo(a.x, a.y);
                            ctx.lineTo(b.x, b.y);
                        }
                    }
                }
            }
            ctx.stroke();

            // 优化粒子渲染 - 按颜色分组批量绘制
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            
            const colorGroups = new Map();
            for (let i = 0, len = particles.length; i < len; i++) {
                const particle = particles[i];
                const colorKey = particle.color;
                if (!colorGroups.has(colorKey)) {
                    colorGroups.set(colorKey, []);
                }
                colorGroups.get(colorKey).push(particle);
            }

            colorGroups.forEach((groupParticles, colorKey) => {
                ctx.beginPath();
                let pathStarted = false;
                
                for (let i = 0, len = groupParticles.length; i < len; i++) {
                    const particle = groupParticles[i];
                    const displayAlpha = Math.min(1, particle.alpha * 1.3);
                    
                    ctx.fillStyle = `rgba(${colorKey}, ${displayAlpha})`;
                    ctx.shadowBlur = particle.glowIntensity * 1.3;
                    ctx.shadowColor = `rgba(${colorKey}, ${Math.min(0.98, displayAlpha + 0.25)})`;
                    
                    if (!pathStarted) {
                        ctx.moveTo(particle.x + particle.size, particle.y);
                        pathStarted = true;
                    }
                    ctx.arc(particle.x, particle.y, particle.size, 0, MATH_PI_2);
                }
                ctx.fill();
            });

            ctx.restore();
        }

        function loop(timestamp) {
            if (!running) return;
            
            const delta = Math.min((timestamp - lastTimestamp) / 1000, 0.05) || 0.016;
            lastTimestamp = timestamp;
            
            update(delta);
            render();
            animationId = requestAnimationFrame(loop);
        }

        function start() {
            if (running || !canvas) return;
            running = true;
            canvas.style.display = "";
            lastTimestamp = performance.now();
            animationId = requestAnimationFrame(loop);
        }

        function stop() {
            if (!running || !canvas) return;
            running = false;
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
            ctx.clearRect(0, 0, width, height);
            canvas.style.display = "none";
        }

        function handlePointerMove(event) {
            if (!pointer.hasPrev) {
                pointer.prevX = event.clientX;
                pointer.prevY = event.clientY;
                pointer.hasPrev = true;
            }
            pointer.x = event.clientX;
            pointer.y = event.clientY;
            pointer.active = true;
        }

        function handlePointerLeave() {
            pointer.active = false;
        }

        function handleVisibilityChange() {
            if (document.hidden) {
                pointer.active = false;
                if (running) stop();
            } else if (isEnabled()) {
                start();
            }
        }

        function enable() {
            localStorage.setItem(STORAGE_KEY, "true");
            if (!document.hidden) start();
        }

        function disable() {
            localStorage.setItem(STORAGE_KEY, "false");
            stop();
            pointer.active = false;
        }

        function isEnabled() {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored === null ? true : stored === "true";
        }

        function clamp(value, min, max) {
            return Math.max(min, Math.min(max, value));
        }

        function lerp(a, b, t) {
            return a + (b - a) * t;
        }

        return { init, enable, disable, isEnabled };
    })();

    const BackgroundToggle = (() => {
        function init() {
            const toggle = document.getElementById("bgToggle");
            if (!toggle) return;
            
            toggle.checked = DynamicBackground.isEnabled();
            toggle.addEventListener("change", () => {
                if (toggle.checked) {
                    DynamicBackground.enable();
                } else {
                    DynamicBackground.disable();
                }
            });
        }

        return { init };
    })();

    const ClickEffects = (() => {
        const COLORS = [
            "rgba(255, 211, 134, 0.9)",
            "rgba(118, 212, 255, 0.9)",
            "rgba(214, 174, 255, 0.9)",
            "rgba(255, 140, 170, 0.9)",
            "rgba(173, 255, 201, 0.9)"
        ];
        const MAX_ACTIVE_EFFECTS = 14;
        const MIN_SPAWN_INTERVAL = 90;
        const QUICK_CLICK_SPARK_SCALE = 0.6;
        const REMOVE_BUFFER = 200;
        let container;
        let lastSpawnTime = 0;

        // 火花对象池
        const sparkPool = [];
        const effectPool = [];

        function init() {
            container = document.getElementById("clickEffects");
            if (!container) return;
            
            // 使用事件委托
            document.addEventListener("click", handleClick, { passive: true });
        }

        function handleClick(event) {
            const target = event.target;
            const tagName = target?.tagName;
            if (tagName === "INPUT" || tagName === "BUTTON" || tagName === "TEXTAREA" || target?.type === "submit") {
                return;
            }
            if (!container) return;
            
            spawnEffect(event.clientX, event.clientY);
        }

        function getEffectFromPool() {
            return effectPool.pop() || document.createElement("span");
        }

        function getSparkFromPool() {
            return sparkPool.pop() || document.createElement("span");
        }

        function recycleEffect(effect) {
            effectPool.push(effect);
        }

        function recycleSpark(spark) {
            sparkPool.push(spark);
        }

        function pruneEffects(maxActive) {
            if (!container) return;
            
            while (container.childElementCount > maxActive) {
                const oldest = container.firstElementChild;
                if (!(oldest instanceof HTMLElement)) break;
                
                const timerId = oldest.dataset.removeTimerId;
                if (timerId) {
                    window.clearTimeout(Number(timerId));
                }
                
                // 回收所有火花
                const sparks = oldest.querySelectorAll('.click-effect__spark');
                sparks.forEach(spark => recycleSpark(spark));
                
                oldest.remove();
                recycleEffect(oldest);
            }
        }

        function spawnEffect(x, y) {
            const now = performance.now();
            const isRapid = (now - lastSpawnTime) < MIN_SPAWN_INTERVAL;
            lastSpawnTime = now;

            pruneEffects(MAX_ACTIVE_EFFECTS - 1);

            const effect = getEffectFromPool();
            effect.className = "click-effect";
            effect.style.left = `${x}px`;
            effect.style.top = `${y}px`;

            const color = COLORS[Math.floor(Math.random() * COLORS.length)];
            const baseSparkCount = 24 + Math.floor(Math.random() * 10);
            const sparkCount = isRapid ? Math.max(12, Math.round(baseSparkCount * QUICK_CLICK_SPARK_SCALE)) : baseSparkCount;
            const minDist = 12;
            const maxDist = 36;
            const minDur = 720;
            const maxDur = 1700;

            // 清空现有火花（复用情况）
            while (effect.firstChild) {
                const spark = effect.firstChild;
                recycleSpark(spark);
                effect.removeChild(spark);
            }

            for (let i = 0; i < sparkCount; i++) {
                const spark = getSparkFromPool();
                spark.className = "click-effect__spark";
                spark.style.background = color;
                spark.style.boxShadow = `0 0 ${10 + Math.random() * 18}px ${color}`;

                const s = 4 + Math.random() * 8;
                spark.style.width = `${s}px`;
                spark.style.height = `${s}px`;

                const angle = Math.random() * MATH_PI_2;
                const distance = minDist + Math.random() * (maxDist - minDist);
                const offsetX = Math.cos(angle) * distance;
                const offsetY = Math.sin(angle) * distance;
                spark.style.setProperty("--spark-x", `${offsetX}px`);
                spark.style.setProperty("--spark-y", `${offsetY}px`);

                const duration = Math.round(minDur + Math.random() * (maxDur - minDur));
                spark.style.animationDuration = `${duration}ms`;
                spark.style.animationDelay = `0ms`;
                spark.style.opacity = `1`;

                effect.appendChild(spark);
            }

            container.appendChild(effect);
            
            const removeAfter = Math.round(maxDur + REMOVE_BUFFER);
            const timerId = window.setTimeout(() => {
                if (effect.parentNode === container) {
                    container.removeChild(effect);
                    recycleEffect(effect);
                }
            }, removeAfter);
            
            effect.dataset.removeTimerId = String(timerId);

            if (container.childElementCount > MAX_ACTIVE_EFFECTS) {
                pruneEffects(MAX_ACTIVE_EFFECTS);
            }
        }

        return { init };
    })();

    // 使用DOMContentLoaded优化加载
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            DynamicBackground.init();
            BackgroundToggle.init();
            ClickEffects.init();
        });
    } else {
        DynamicBackground.init();
        BackgroundToggle.init();
        ClickEffects.init();
    }
})();