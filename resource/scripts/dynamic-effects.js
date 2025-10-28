// 动态背景和点击特效初始化
document.addEventListener('DOMContentLoaded', function() {
    initDynamicBackground();
    initClickEffects();
});

let animationId;

// 增强版动态背景
function initDynamicBackground() {
    const canvas = document.getElementById('dynamicBackground');
    if (!canvas) {
        return;
    }
    const ctx = canvas.getContext('2d');

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const particles = [];
    const particleCount = 100;

    const mouse = {
        x: null,
        y: null,
        radius: 100
    };

    window.addEventListener('mousemove', function(e) {
        mouse.x = e.x;
        mouse.y = e.y;
    });

    window.addEventListener('mouseout', function() {
        mouse.x = null;
        mouse.y = null;
    });

    class Particle {
        constructor() {
            this.reset();
        }

        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 3 + 1;
            this.baseX = this.x;
            this.baseY = this.y;
            this.density = Math.random() * 30 + 1;
            this.color = `rgba(255, 255, 255, ${Math.random() * 0.5 + 0.1})`;
        }

        update() {
            if (mouse.x === null || mouse.y === null) {
                this.moveToBase();
                return;
            }

            const dx = mouse.x - this.x;
            const dy = mouse.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;
            const maxDistance = mouse.radius;

            if (distance < maxDistance) {
                const force = (maxDistance - distance) / maxDistance;
                const directionX = (dx / distance) * force * this.density;
                const directionY = (dy / distance) * force * this.density;
                this.x -= directionX;
                this.y -= directionY;
            } else {
                this.moveToBase();
            }
        }

        moveToBase() {
            if (this.x !== this.baseX) {
                const dx = this.x - this.baseX;
                this.x -= dx / 10;
            }
            if (this.y !== this.baseY) {
                const dy = this.y - this.baseY;
                this.y -= dy / 10;
            }
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fillStyle = this.color;
            ctx.globalAlpha = 1;
            ctx.fill();
        }
    }

    function initParticles() {
        particles.length = 0;
        for (let i = 0; i < particleCount; i++) {
            particles.push(new Particle());
        }
    }

    function drawConnections() {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < 120) {
                    const opacity = 1 - distance / 120;
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.2})`;
                    ctx.lineWidth = 1;
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach(function(particle) {
            particle.update();
            particle.draw();
        });

        drawConnections();
        animationId = requestAnimationFrame(animate);
    }

    initParticles();
    animate();

    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
        } else if (!animationId) {
            animationId = requestAnimationFrame(animate);
        }
    });
}

// 点击特效初始化
function initClickEffects() {
    const effectsContainer = document.getElementById('clickEffects');
    if (!effectsContainer) {
        return;
    }

    document.addEventListener('click', function(e) {
        const tagName = e.target.tagName;
        if (tagName === 'INPUT' || tagName === 'BUTTON' || tagName === 'TEXTAREA') {
            return;
        }
        if (e.target.type === 'submit') {
            return;
        }

        createClickEffect(e.clientX, e.clientY);
    });

    function createClickEffect(x, y) {
        const effect = document.createElement('div');
        effect.className = 'click-effect';
        effect.style.left = `${x}px`;
        effect.style.top = `${y}px`;

        const colors = [
            'rgba(102, 126, 234, 0.5)',
            'rgba(118, 75, 162, 0.5)',
            'rgba(255, 107, 107, 0.5)',
            'rgba(77, 208, 225, 0.5)',
            'rgba(255, 206, 84, 0.5)'
        ];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        effect.style.backgroundColor = randomColor;

        effectsContainer.appendChild(effect);

        setTimeout(function() {
            if (effect.parentNode) {
                effect.parentNode.removeChild(effect);
            }
        }, 600);
    }
}
