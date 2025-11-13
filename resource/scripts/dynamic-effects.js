(() => {
    // === Part 1: 动态背景动画模块 ===

    const STORAGE_KEY = "dynamicBackgroundEnabled";

    const DynamicBackground = (() => {
        let canvas;
        let ctx;
        let width = 0;
        let height = 0;
        let animationId = null;
        let lastTimestamp = 0;
        let resizeRaf = null;
        let running = false;
        let particles = [];

        // --- 状态与配置 ---

        // 性能优化：重用对象和数组
        const spatialPartition = {
            grid: new Map(),
            cellX: [],
            cellY: []
        };

        // 性能优化：避免在动画循环中创建新对象
        const pointer = {
            x: 0,
            y: 0,
            active: false,
            prevX: 0,
            prevY: 0,
            vx: 0,
            vy: 0,
            hasPrev: false
        };

        // 重用向量计算对象以避免内存分配
        const tempVector = { dx: 0, dy: 0, distance: 0, distanceSq: 0 };

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
            // 恢复原来的连线参数
            connectionOpacity: 0.38, // 恢复为 0.38
            connectionWidth: 0.9 * 2 * 0.9 * 0.9, // 恢复为原来的值
            // 保持增加的粒子尺寸范围
            sizeRange: [Math.round(1.88 * 0.9 * 0.9 * 100) / 100, Math.round(5.64 * 0.9 * 0.9 * 100) / 100],
            wrapMargin: 0,
            colors: [
                "255, 221, 154", // 保持增加的亮度
                "138, 222, 255", // 保持增加的亮度
                "224, 184, 255", // 保持增加的亮度
                "255, 160, 190", // 保持增加的亮度
                "183, 255, 211"  // 保持增加的亮度
            ],
            twinkleSpeedRange: [0.5, 1.4]
        };

        // --- 初始化与生命周期 ---

        function init() {
            canvas = document.getElementById("dynamicBackground");
            if (!canvas) {
                return;
            }

            ctx = canvas.getContext("2d", { alpha: true });
            handleResize();
            adjustParticleCount(true);

            // 使用 passive event listeners 提高滚动性能
            const passiveOptions = { passive: true };
            window.addEventListener("resize", scheduleResize, passiveOptions);
            window.addEventListener("pointermove", handlePointerMove, passiveOptions);
            window.addEventListener("pointerdown", handlePointerMove, passiveOptions);
            window.addEventListener("pointerleave", handlePointerLeave, passiveOptions);
            window.addEventListener("pointercancel", handlePointerLeave, passiveOptions);
            document.addEventListener("visibilitychange", handleVisibilityChange);

            if (isEnabled() && !document.hidden) {
                start();
            } else if (!isEnabled()) {
                canvas.style.display = "none";
            }
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

        function handleVisibilityChange() {
            if (document.hidden) {
                pointer.active = false;
                if (running) {
                    stop();
                }
            } else if (isEnabled()) {
                start();
            }
        }

        function cleanup() {
            stop();
            if (resizeRaf) {
                cancelAnimationFrame(resizeRaf);
                resizeRaf = null;
            }
            if (pointerMoveRaf) {
                cancelAnimationFrame(pointerMoveRaf);
                pointerMoveRaf = null;
            }

            const passiveOptions = { passive: true };
            window.removeEventListener("resize", scheduleResize, passiveOptions);
            window.removeEventListener("pointermove", handlePointerMove, passiveOptions);
            window.removeEventListener("pointerdown", handlePointerMove, passiveOptions);
            window.removeEventListener("pointerleave", handlePointerLeave, passiveOptions);
            window.removeEventListener("pointercancel", handlePointerLeave, passiveOptions);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        }

        // --- 尺寸与粒子管理 ---

        function scheduleResize() {
            if (resizeRaf) {
                cancelAnimationFrame(resizeRaf);
            }
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
            if (!width || !height) {
                return;
            }
            const target = clamp(Math.round(width * height * CONFIG.density), CONFIG.minParticles, CONFIG.maxParticles);
            
            if (resetPositions) {
                particles = new Array(target).fill(null).map(createParticle);
                return;
            }
            
            // 性能优化：避免频繁的数组操作
            const currentCount = particles.length;
            if (currentCount > target) {
                particles.length = target;
            } else if (currentCount < target) {
                const needed = target - currentCount;
                for (let i = 0; i < needed; i++) {
                    particles.push(createParticle());
                }
            }
        }

        function createParticle() {
            const angle = Math.random() * Math.PI * 2;
            const origSpeed = (Math.random() * CONFIG.speedLimit * 0.7) + (CONFIG.speedLimit * 0.25);
            const baseSpeed = origSpeed * 0.75;
            const [minSize, maxSize] = CONFIG.sizeRange;
            const color = CONFIG.colors[Math.floor(Math.random() * CONFIG.colors.length)];
            // 保持增加的粒子透明度
            const baseAlpha = 0.65 + Math.random() * 0.4;
            
            return {
                x: Math.random() * width,
                y: Math.random() * height,
                vx: Math.cos(angle) * baseSpeed,
                vy: Math.sin(angle) * baseSpeed,
                baseSpeed,
                size: minSize + Math.random() * (maxSize - minSize),
                jitter: Math.random() * 0.6 + 0.45,
                color,
                alpha: baseAlpha,
                baseAlpha,
                twinklePhase: Math.random() * Math.PI * 2,
                twinkleSpeed: CONFIG.twinkleSpeedRange[0] + Math.random() * (CONFIG.twinkleSpeedRange[1] - CONFIG.twinkleSpeedRange[0]),
                // 保持增加的发光强度
                glowIntensity: 9 + Math.random() * 10
            };
        }

        // --- 动画循环与渲染 ---

        function update(delta) {
            const maxSpeed = CONFIG.speedLimit;
            const frictionFactor = 1 - CONFIG.friction * delta;

            // 性能优化：提前计算常用值
            if (pointer.active && pointer.hasPrev && delta > 0) {
                pointer.vx = (pointer.x - pointer.prevX) / delta;
                pointer.vy = (pointer.y - pointer.prevY) / delta;
            } else {
                pointer.vx *= 0.85;
                pointer.vy *= 0.85;
            }
            pointer.prevX = pointer.x;
            pointer.prevY = pointer.y;

            const maxSpeedSq = maxSpeed * maxSpeed;
            const pointerRadius = CONFIG.pointerRadius;
            const pointerRadiusSq = pointerRadius * pointerRadius;
            const pointerFarRadius = pointerRadius * 0.6;
            const pointerFarRadiusSq = pointerFarRadius * pointerFarRadius;
            const pointerMidRadiusSq = (pointerRadius * 0.35) * (pointerRadius * 0.35);
            const pointerSnapRadius = Math.max(2, pointerRadius * 0.06);
            const pointerSnapRadiusSq = pointerSnapRadius * pointerSnapRadius;

            // 性能优化：缓存数组长度
            const particleCount = particles.length;
            for (let i = 0; i < particleCount; i++) {
                const particle = particles[i];
                let underInfluence = false;

                if (pointer.active) {
                    const dx = pointer.x - particle.x;
                    const dy = pointer.y - particle.y;
                    const distanceSq = dx * dx + dy * dy;

                    if (distanceSq >= pointerFarRadiusSq) {
                        particle.vx += (Math.random() - 0.5) * CONFIG.drift * particle.jitter * delta;
                        particle.vy += (Math.random() - 0.5) * CONFIG.drift * particle.jitter * delta;
                    }

                    if (distanceSq > 0 && distanceSq < pointerRadiusSq) {
                        underInfluence = true;
                        const distance = Math.sqrt(distanceSq);
                        const influence = (pointerRadius - distance) / pointerRadius;
                        const invDistance = 1 / distance;
                        const dirX = dx * invDistance;
                        const dirY = dy * invDistance;

                        const desiredSpeed = Math.max(maxSpeed * 0.5, maxSpeed * 0.9);

                        if (distanceSq >= pointerMidRadiusSq) {
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

                            if (distanceSq < pointerSnapRadiusSq) {
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
                if (velocitySq > maxSpeedSq) {
                    const scale = maxSpeed / Math.sqrt(velocitySq);
                    particle.vx *= scale;
                    particle.vy *= scale;
                }

                particle.x += particle.vx * delta;
                particle.y += particle.vy * delta;

                particle.twinklePhase += delta * particle.twinkleSpeed;
                // 保持增加的闪烁幅度
                particle.alpha = clamp(
                    particle.baseAlpha + Math.sin(particle.twinklePhase) * 0.28,
                    0.3,
                    1.1
                );

                const margin = CONFIG.wrapMargin;
                if (particle.x < -margin) particle.x = width + margin;
                if (particle.x > width + margin) particle.x = -margin;
                if (particle.y < -margin) particle.y = height + margin;
                if (particle.y > height + margin) particle.y = -margin;
            }
        }

        function render() {
            ctx.clearRect(0, 0, width, height);

            ctx.lineWidth = CONFIG.connectionWidth;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            const connectionDistance = CONFIG.connectionDistance;
            const connectionDistanceSq = connectionDistance * connectionDistance;
            const cellSize = connectionDistance || 1;
            const grid = spatialPartition.grid;
            const cellXCache = spatialPartition.cellX;
            const cellYCache = spatialPartition.cellY;

            grid.clear();

            // 性能优化：预分配空间
            if (cellXCache.length < particles.length) {
                const needed = particles.length - cellXCache.length;
                for (let i = 0; i < needed; i++) {
                    cellXCache.push(0);
                    cellYCache.push(0);
                }
            }

            // 构建空间分区网格
            const particleCount = particles.length;
            for (let i = 0; i < particleCount; i++) {
                const particle = particles[i];
                const cellX = Math.floor(particle.x / cellSize);
                const cellY = Math.floor(particle.y / cellSize);
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

            // 渲染连接线 - 恢复原来的连线参数
            for (let i = 0; i < particleCount; i++) {
                const a = particles[i];
                const baseCellX = cellXCache[i];
                const baseCellY = cellYCache[i];
                
                for (let offsetY = -1; offsetY <= 1; offsetY++) {
                    for (let offsetX = -1; offsetX <= 1; offsetX++) {
                        const neighborKey = `${baseCellX + offsetX},${baseCellY + offsetY}`;
                        const bucket = grid.get(neighborKey);
                        if (!bucket) continue;
                        
                        const bucketLength = bucket.length;
                        for (let k = 0; k < bucketLength; k++) {
                            const j = bucket[k];
                            if (j <= i) continue;
                            
                            const b = particles[j];
                            tempVector.dx = a.x - b.x;
                            tempVector.dy = a.y - b.y;
                            tempVector.distanceSq = tempVector.dx * tempVector.dx + tempVector.dy * tempVector.dy;
                            
                            if (tempVector.distanceSq >= connectionDistanceSq) continue;
                            
                            tempVector.distance = Math.sqrt(tempVector.distanceSq);
                            const connectionAlpha = CONFIG.connectionOpacity * (1 - tempVector.distance / connectionDistance);
                            if (connectionAlpha <= 0) continue;
                            
                            // 恢复原来的连线亮度计算
                            let brightness = 0.6 + 0.4 * Math.min(a.alpha, b.alpha);
                            brightness = Math.min(1, brightness * 1.2);
                            // 恢复原来的连线颜色
                            ctx.strokeStyle = `rgba(180, 220, 255, ${Math.min(1, connectionAlpha * brightness)})`;
                            ctx.beginPath();
                            ctx.moveTo(a.x, a.y);
                            ctx.lineTo(b.x, b.y);
                            ctx.stroke();
                        }
                    }
                }
            }

            // 渲染粒子 - 保持增加的亮度和发光效果
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            for (let i = 0; i < particleCount; i++) {
                const particle = particles[i];
                // 保持增加的显示透明度
                const displayAlpha = Math.min(1.2, particle.alpha * 1.5);
                ctx.fillStyle = `rgba(${particle.color}, ${displayAlpha})`;
                // 保持增加的阴影模糊和强度
                ctx.shadowBlur = particle.glowIntensity * 1.5;
                ctx.shadowColor = `rgba(${particle.color}, ${Math.min(1.1, displayAlpha + 0.35)})`;
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        function loop(timestamp) {
            if (!running) return;
            
            const delta = Math.min((timestamp - lastTimestamp) / 1000, 0.05) || 0.016;
            lastTimestamp = timestamp;
            
            // 性能优化：使用时间分片，在帧率下降时降低更新频率
            if (delta < 0.1) { // 只在正常帧率下更新
                update(delta);
                render();
            }
            
            animationId = requestAnimationFrame(loop);
        }

        // --- 指针交互 ---

        // 性能优化：防抖处理鼠标移动事件
        let pointerMoveRaf = null;
        function handlePointerMove(event) {
            if (pointerMoveRaf) {
                cancelAnimationFrame(pointerMoveRaf);
            }
            pointerMoveRaf = requestAnimationFrame(() => {
                pointerMoveRaf = null;
                if (!pointer.hasPrev) {
                    pointer.prevX = event.clientX;
                    pointer.prevY = event.clientY;
                    pointer.hasPrev = true;
                }
                pointer.x = event.clientX;
                pointer.y = event.clientY;
                pointer.active = true;
            });
        }

        function handlePointerLeave() {
            pointer.active = false;
        }

        // --- 模块开关与工具 ---

        function enable() {
            localStorage.setItem(STORAGE_KEY, "true");
            if (!document.hidden) {
                start();
            }
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

        return {
            init,
            enable,
            disable,
            isEnabled,
            cleanup
        };
    })();

    // === Part 2: 背景开关 UI ===

    const BackgroundToggle = (() => {
        function init() {
            const toggle = document.getElementById("bgToggle");
            if (!toggle) {
                return;
            }
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

    // === Part 3: 点击特效 ===

    const ClickEffects = (() => {
        // 保持增加的点击效果颜色亮度
        const COLORS = [
            "rgba(255, 221, 154, 0.9)",
            "rgba(138, 222, 255, 0.9)",
            "rgba(224, 184, 255, 0.9)",
            "rgba(255, 160, 190, 0.9)",
            "rgba(183, 255, 211, 0.9)"
        ];
        const MAX_ACTIVE_EFFECTS = 14;
        const MIN_SPAWN_INTERVAL = 90;
        const QUICK_CLICK_SPARK_SCALE = 0.6;
        const REMOVE_BUFFER = 200;
        let container;
        let lastSpawnTime = 0;
        // 性能优化：重用数组和对象
        const activeTimers = new Set();

        // --- 初始化与事件绑定 ---

        function init() {
            container = document.getElementById("clickEffects");
            if (!container) {
                return;
            }
            document.addEventListener("click", handleClick, { passive: true });
        }

        function handleClick(event) {
            const tagName = event.target?.tagName;
            if (tagName === "INPUT" || tagName === "BUTTON" || tagName === "TEXTAREA") {
                return;
            }
            if (event.target?.type === "submit") {
                return;
            }
            if (!container) {
                return;
            }
            spawnEffect(event.clientX, event.clientY);
        }

        // --- 效果管理 ---

        function pruneEffects(maxActive) {
            if (!container) return;
            
            while (container.childElementCount > maxActive) {
                const oldest = container.firstElementChild;
                if (!(oldest instanceof HTMLElement)) break;
                
                const timerId = oldest.dataset.removeTimerId;
                if (timerId) {
                    clearTimeout(Number(timerId));
                    activeTimers.delete(Number(timerId));
                }
                oldest.remove();
            }
        }

        // --- 动画生成 ---

        function spawnEffect(x, y) {
            const now = performance.now();
            const isRapid = (now - lastSpawnTime) < MIN_SPAWN_INTERVAL;
            lastSpawnTime = now;

            pruneEffects(MAX_ACTIVE_EFFECTS - 1);

            const effect = document.createElement("span");
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

            // 性能优化：使用文档片段批量添加DOM元素
            const fragment = document.createDocumentFragment();
            
            for (let i = 0; i < sparkCount; i++) {
                const spark = document.createElement("span");
                spark.className = "click-effect__spark";
                spark.style.background = color;
                // 保持增加的火花光晕效果
                spark.style.boxShadow = `0 0 ${12 + Math.random() * 20}px ${color}`;

                const s = 4 + Math.random() * 8;
                spark.style.width = `${s}px`;
                spark.style.height = `${s}px`;

                const angle = Math.random() * Math.PI * 2;
                const distance = minDist + Math.random() * (maxDist - minDist);
                const offsetX = Math.cos(angle) * distance;
                const offsetY = Math.sin(angle) * distance;
                spark.style.setProperty("--spark-x", `${offsetX}px`);
                spark.style.setProperty("--spark-y", `${offsetY}px`);

                const duration = Math.round(minDur + Math.random() * (maxDur - minDur));
                spark.style.animationDuration = `${duration}ms`;
                spark.style.animationDelay = `0ms`;
                spark.style.opacity = `1`;

                fragment.appendChild(spark);
            }

            effect.appendChild(fragment);
            container.appendChild(effect);

            const removeAfter = Math.round(maxDur + REMOVE_BUFFER);
            const timerId = setTimeout(() => {
                if (effect.parentNode) {
                    effect.remove();
                }
                activeTimers.delete(timerId);
            }, removeAfter);
            
            effect.dataset.removeTimerId = String(timerId);
            activeTimers.add(timerId);

            if (container.childElementCount > MAX_ACTIVE_EFFECTS) {
                pruneEffects(MAX_ACTIVE_EFFECTS);
            }
        }

        // --- 清理 ---

        // 清理函数，防止内存泄漏
        function cleanup() {
            if (container) {
                while (container.firstChild) {
                    container.firstChild.remove();
                }
            }
            
            // 清理所有活动的定时器
            activeTimers.forEach(timerId => {
                clearTimeout(timerId);
            });
            activeTimers.clear();
            
            document.removeEventListener("click", handleClick);
        }

        return { 
            init,
            cleanup
        };
    })();

    // === Part 4: 全局入口与清理 ===

    // 全局清理函数
    function cleanupAll() {
        DynamicBackground.cleanup();
        ClickEffects.cleanup();
    }

    // 页面卸载时清理
    window.addEventListener('beforeunload', cleanupAll);

    document.addEventListener("DOMContentLoaded", () => {
        DynamicBackground.init();
        BackgroundToggle.init();
        ClickEffects.init();
    });

    // 导出清理函数以便在需要时手动调用
    return {
        cleanup: cleanupAll
    };
})();