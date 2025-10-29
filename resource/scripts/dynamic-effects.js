(() => {
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
        const spatialPartition = {
            grid: new Map(),
            cellX: [],
            cellY: []
        };

        const pointer = {
            x: 0,
            y: 0,
            active: false,
            // track previous position and velocity to enable velocity-matching and strong damping
            prevX: 0,
            prevY: 0,
            vx: 0,
            vy: 0,
            hasPrev: false
        };

        const CONFIG = {
            // 粒子总量 -> 原来 * 0.8，然后再减少 10%
            // 总体粒子密度（再缩小 10%）
            density: 0.00011 * 0.8 * 0.9 * 0.9, // 原来基础再减少 10%
            // 同步限制最小/最大数量为约 80% 再减 10%
            minParticles: Math.max(8, Math.round(130 * 0.8 * 0.9)), // ≈94
            maxParticles: Math.max(16, Math.round(280 * 0.8 * 0.9)), // ≈202
            friction: 0.045,
            // 在当前基础上再增加 20% 的移动速度（drift / speedLimit）
            drift: Math.round(33.8 * 1.2 * 100) / 100, // ≈40.56
            speedLimit: Math.round(182 * 1.2), // ≈218
            // 鼠标影响：缩小影响范围，但保留并增强近距离掌控感
            pointerRadius: 83, // 缩小影响半径 25%（110 * 0.75 = 82.5 -> 83）
            pointerStrength: 8000, // 大幅增强总体强度以进一步减少感知延迟
            // 直接拉拽强度（位置 lerp 因子），越大响应越直接
            pointerDirectPull: 0.28, // 显著提高近距离拉拽强度以最大化掌控感
            // 在非常近的距离将速度直接设置为 speedLimit 的比例以快速抓住粒子
            pointerVelocitySet: 1.2, // 略超速目标以确保瞬时响应（后续会受速度上限约束）
            // 线段数量目标 -> 约为原来 * 0.6（先前设定），现在再减少 10%（通过缩小检测距离的平方比例实现，采用 sqrt(0.9) 缩放距离）
            // 连接检测距离缩小 10%
            connectionDistance: Math.round(220 * 0.775 * Math.sqrt(0.9) * 0.9), // 约原来的 90%
            connectionOpacity: 0.38,
            // 线段更粗 -> 原来 * 2
            // 线宽再缩小 10%
            connectionWidth: 0.9 * 2 * 0.9 * 0.9, // 再乘 0.9
            // 粒子尺寸：在此前缩放基础上再缩小 10%
            sizeRange: [Math.round(1.68 * 0.9 * 0.9 * 100) / 100, Math.round(5.04 * 0.9 * 0.9 * 100) / 100], // ≈ [1.36, 4.08]
            // 扩展粒子自由移动范围到全屏（边缘直接换位）
            wrapMargin: 0,
            colors: [
                "255, 211, 134",
                "118, 212, 255",
                "214, 174, 255",
                "255, 140, 170",
                "173, 255, 201"
            ],
            twinkleSpeedRange: [0.5, 1.4]
        };

        function init() {
            canvas = document.getElementById("dynamicBackground");
            if (!canvas) {
                return;
            }

            ctx = canvas.getContext("2d", { alpha: true });
            handleResize();
            adjustParticleCount(true);

            window.addEventListener("resize", scheduleResize, { passive: true });
            window.addEventListener("pointermove", handlePointerMove, { passive: true });
            window.addEventListener("pointerdown", handlePointerMove, { passive: true });
            window.addEventListener("pointerleave", handlePointerLeave, { passive: true });
            window.addEventListener("pointercancel", handlePointerLeave, { passive: true });
            document.addEventListener("visibilitychange", handleVisibilityChange);

            if (isEnabled() && !document.hidden) {
                start();
            } else if (!isEnabled()) {
                canvas.style.display = "none";
            }
        }

        function scheduleResize() {
            if (resizeRaf) {
                return;
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
            if (particles.length > target) {
                particles.length = target;
            } else {
                while (particles.length < target) {
                    particles.push(createParticle());
                }
            }
        }

        function createParticle() {
            const angle = Math.random() * Math.PI * 2;
            // 原始速度范围（保留原始分布），自由状态下实际使用 baseSpeed = 原始 * 0.75
            const origSpeed = (Math.random() * CONFIG.speedLimit * 0.7) + (CONFIG.speedLimit * 0.25);
            const baseSpeed = origSpeed * 0.75; // 自由状态速度为原来的 75%
            const [minSize, maxSize] = CONFIG.sizeRange;
            const color = CONFIG.colors[Math.floor(Math.random() * CONFIG.colors.length)];
            const baseAlpha = 0.45 + Math.random() * 0.4;
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
                glowIntensity: 6 + Math.random() * 8
            };
        }

        function update(delta) {
            const maxSpeed = CONFIG.speedLimit;
            const frictionFactor = 1 - CONFIG.friction * delta;

            // update pointer velocity estimate (per-frame) so particles can match pointer motion
            if (pointer.active && pointer.hasPrev && delta > 0) {
                pointer.vx = (pointer.x - pointer.prevX) / delta;
                pointer.vy = (pointer.y - pointer.prevY) / delta;
            } else {
                // decay pointer velocity when not active or first frame
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

            for (let i = 0; i < particles.length; i++) {
                const particle = particles[i];
                // 标记该粒子是否正在受到指针的直接影响（在 CONFIG.pointerRadius 内）
                let underInfluence = false;
                // 根据与指针距离分区处理，以抑制靠近时的高频震荡：
                // - 远区（>= 0.6 * radius）：允许漂移与轻量脉冲
                // - 中区 (0.35-0.6 * radius): 使用速度 lerp 与小脉冲，减少随机漂移
                // - 近区 (< 0.35 * radius): 禁用脉冲和随机漂移，强力位置 lerp + 速度匹配 + 阻尼
                if (pointer.active) {
                    const dx = pointer.x - particle.x;
                    const dy = pointer.y - particle.y;
                    const distanceSq = dx * dx + dy * dy;

                    // 允许随机漂移仅在较远区域，避免靠近时的高频震荡
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

                        // 中远区：仍可施加较小脉冲并做速度 lerp，但强度降低以避免震荡
                        if (distanceSq >= pointerMidRadiusSq) {
                            // 增强中区的即时响应：适度放大脉冲并提高速度对齐比重
                            const impulse = CONFIG.pointerStrength * Math.pow(influence, 2.2) * 0.002; // 提高脉冲系数以减少感知延迟
                            particle.vx += dirX * impulse;
                            particle.vy += dirY * impulse;

                            // 更激进的速度对齐（更高 blend）以快速匹配方向和速度
                            const blend = 0.7 + 0.45 * Math.pow(influence, 1.4);
                            particle.vx = lerp(particle.vx, dirX * desiredSpeed, blend);
                            particle.vy = lerp(particle.vy, dirY * desiredSpeed, blend);

                            const pull = CONFIG.pointerDirectPull * Math.pow(influence, 1.1);
                            particle.x += dx * pull;
                            particle.y += dy * pull;

                        } else {
                            // 近区：禁用脉冲与随机漂移，优先速度/位置匹配并强力阻尼以消除抖动
                            // 将粒子位置快速靠拢到指针位置（高比例 lerp）
                            // 更快速、更紧密地贴合指针：提高位置 lerp 和速度匹配比例
                            particle.x = lerp(particle.x, pointer.x, 0.95);
                            particle.y = lerp(particle.y, pointer.y, 0.95);

                            // 把粒子速度更快匹配到指针速度（减少滞后）
                            particle.vx = lerp(particle.vx, pointer.vx, 0.98);
                            particle.vy = lerp(particle.vy, pointer.vy, 0.98);

                            // 更强阻尼更快耗散残余能量，避免回弹
                            particle.vx *= 0.35;
                            particle.vy *= 0.35;

                            // 当非常非常靠近（几像素以内），直接置零速度以让粒子“停住”
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

                // 如果粒子处于自由状态（未被指针影响），强制其速度大小为 baseSpeed，
                // 以保持速度幅值随时间恒定（符号与方向可变化，但大小固定）。
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
                particle.alpha = clamp(
                    particle.baseAlpha + Math.sin(particle.twinklePhase) * 0.22,
                    0.2,
                    1
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

            for (let i = 0; i < particles.length; i++) {
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

            for (let i = 0; i < particles.length; i++) {
                const a = particles[i];
                const baseCellX = cellXCache[i];
                const baseCellY = cellYCache[i];
                for (let offsetY = -1; offsetY <= 1; offsetY++) {
                    for (let offsetX = -1; offsetX <= 1; offsetX++) {
                        const neighborKey = `${baseCellX + offsetX},${baseCellY + offsetY}`;
                        const bucket = grid.get(neighborKey);
                        if (!bucket) {
                            continue;
                        }
                        for (let k = 0; k < bucket.length; k++) {
                            const j = bucket[k];
                            if (j <= i) {
                                continue;
                            }
                            const b = particles[j];
                            const dx = a.x - b.x;
                            const dy = a.y - b.y;
                            const distSq = dx * dx + dy * dy;
                            if (distSq >= connectionDistanceSq) {
                                continue;
                            }
                            const distance = Math.sqrt(distSq);
                            const connectionAlpha = CONFIG.connectionOpacity * (1 - distance / connectionDistance);
                            if (connectionAlpha <= 0) {
                                continue;
                            }
                            // 增加连线亮度 20% 基础（不再基于鼠标靠近放大线宽）
                            let brightness = 0.6 + 0.4 * Math.min(a.alpha, b.alpha);
                            brightness = Math.min(1, brightness * 1.2);
                            ctx.strokeStyle = `rgba(180, 220, 255, ${Math.min(1, connectionAlpha * brightness)})`;
                            ctx.beginPath();
                            ctx.moveTo(a.x, a.y);
                            ctx.lineTo(b.x, b.y);
                            ctx.stroke();
                        }
                    }
                }
            }

            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            particles.forEach((particle) => {
                // 增加粒子亮度 30%（渲染时放大 alpha 和 shadow）
                const displayAlpha = Math.min(1, particle.alpha * 1.3);
                ctx.fillStyle = `rgba(${particle.color}, ${displayAlpha})`;
                ctx.shadowBlur = particle.glowIntensity * 1.3;
                ctx.shadowColor = `rgba(${particle.color}, ${Math.min(0.98, displayAlpha + 0.25)})`;
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.restore();
        }

        function loop(timestamp) {
            if (!running) {
                return;
            }
            const delta = Math.min((timestamp - lastTimestamp) / 1000, 0.05) || 0.016;
            lastTimestamp = timestamp;
            update(delta);
            render();
            animationId = requestAnimationFrame(loop);
        }

        function start() {
            if (running || !canvas) {
                return;
            }
            running = true;
            canvas.style.display = "";
            lastTimestamp = performance.now();
            animationId = requestAnimationFrame(loop);
        }

        function stop() {
            if (!running || !canvas) {
                return;
            }
            running = false;
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
            ctx.clearRect(0, 0, width, height);
            canvas.style.display = "none";
        }

        function handlePointerMove(event) {
            // ensure we mark that we have a previous pointer sample for velocity estimation
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
                if (running) {
                    stop();
                }
            } else if (isEnabled()) {
                start();
            }
        }

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
            isEnabled
        };
    })();

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

    const ClickEffects = (() => {
        const COLORS = [
            "rgba(255, 211, 134, 0.9)",
            "rgba(118, 212, 255, 0.9)",
            "rgba(214, 174, 255, 0.9)",
            "rgba(255, 140, 170, 0.9)",
            "rgba(173, 255, 201, 0.9)"
        ];
        const MAX_ACTIVE_EFFECTS = 14;
        const MIN_SPAWN_INTERVAL = 90; // ms
        const QUICK_CLICK_SPARK_SCALE = 0.6;
        const REMOVE_BUFFER = 200; // ms
        let container;
        let lastSpawnTime = 0;

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

        function pruneEffects(maxActive) {
            if (!container) {
                return;
            }
            while (container.childElementCount > maxActive) {
                const oldest = container.firstElementChild;
                if (!(oldest instanceof HTMLElement)) {
                    break;
                }
                const timerId = oldest.dataset.removeTimerId;
                if (timerId) {
                    window.clearTimeout(Number(timerId));
                }
                oldest.remove();
            }
        }

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
            // 烟花效果：保持散开半径不变，但使视觉更明显（更多火花、更大发光、更快完成）
            const baseSparkCount = 24 + Math.floor(Math.random() * 10); // 24-33 火花
            const sparkCount = isRapid ? Math.max(12, Math.round(baseSparkCount * QUICK_CLICK_SPARK_SCALE)) : baseSparkCount;
            // 散开半径：缩小为原来的一半以减小爆炸覆盖范围
            const minDist = 12;
            const maxDist = 36;
            // 随机生命周期：延长以让爆炸持续更久（其它值不变，包含 animationDelay）
            const minDur = 720; // 稍微延长最小时长（先前 640 -> 720）
            const maxDur = 1700; // 稍微延长最大时长（先前 1520 -> 1700）

            for (let i = 0; i < sparkCount; i++) {
                const spark = document.createElement("span");
                spark.className = "click-effect__spark";
                spark.style.background = color;
                // 更大的发光范围以增强可见度
                spark.style.boxShadow = `0 0 ${10 + Math.random() * 18}px ${color}`;

                // 随机大小（增大）
                const s = 4 + Math.random() * 8; // 4-12px
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
                // start immediately to minimize click -> explosion latency
                spark.style.animationDelay = `0ms`;
                // 更明显：确保可见度
                spark.style.opacity = `1`;

                effect.appendChild(spark);
            }

            container.appendChild(effect);
            // 移除时间基于最长 spark 动画时长（留有少量缓冲）
            const removeAfter = Math.round(maxDur + REMOVE_BUFFER); // 安全上限
            const timerId = window.setTimeout(() => {
                effect.remove();
            }, removeAfter);
            effect.dataset.removeTimerId = String(timerId);

            if (container.childElementCount > MAX_ACTIVE_EFFECTS) {
                pruneEffects(MAX_ACTIVE_EFFECTS);
            }
        }

        return { init };
    })();

    document.addEventListener("DOMContentLoaded", () => {
        DynamicBackground.init();
        BackgroundToggle.init();
        ClickEffects.init();
    });
})();
