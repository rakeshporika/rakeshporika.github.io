const LENIS_URL = 'https://cdn.jsdelivr.net/npm/lenis@1.1.20/dist/lenis.mjs';
const BACKGROUND_STATE_KEY = 'rp-background-state';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Tells the inline <head> guard that the script arrived, so it keeps the
// JS-driven reveal styles instead of falling back to the CSS-only ones.
window.__siteReady = true;

setupMobileNavigation();
setupNavScrollState();
setupScrollReveal();
setupSmoothScroll();
setupPrefetch();
setupBackground();

function setupMobileNavigation() {
    const nav = document.getElementById('navLinks');
    const hamburger = document.getElementById('hamburgerBtn');

    if (!nav || !hamburger) {
        return;
    }

    const icon = hamburger.querySelector('i');

    const setOpen = (open) => {
        nav.classList.toggle('active', open);
        hamburger.setAttribute('aria-expanded', String(open));
        hamburger.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');

        if (icon) {
            icon.classList.toggle('fa-bars', !open);
            icon.classList.toggle('fa-xmark', open);
        }
    };

    hamburger.addEventListener('click', (event) => {
        event.stopPropagation();
        setOpen(!nav.classList.contains('active'));
    });

    nav.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => setOpen(false));
    });

    document.addEventListener('click', (event) => {
        if (!nav.contains(event.target) && !hamburger.contains(event.target)) {
            setOpen(false);
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && nav.classList.contains('active')) {
            setOpen(false);
            hamburger.focus();
        }
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 900) {
            setOpen(false);
        }
    });
}

// Adds a soft shadow to the fixed nav once the page has scrolled.
function setupNavScrollState() {
    const nav = document.querySelector('nav');

    if (!nav) {
        return;
    }

    let ticking = false;

    const update = () => {
        nav.classList.toggle('is-scrolled', window.scrollY > 8);
        ticking = false;
    };

    window.addEventListener('scroll', () => {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(update);
        }
    }, { passive: true });

    update();
}

// Reveals content as it enters the viewport instead of animating everything
// on load (where below-the-fold items would animate unseen).
function setupScrollReveal() {
    const root = document.documentElement;

    // The <head> guard removed the class because this script was slow to
    // arrive: the CSS-only fallback is already showing everything.
    if (!root.classList.contains('js')) {
        return;
    }

    const targets = document.querySelectorAll(
        '.reveal-1, .reveal-2, .reveal-3, .reveal-4, .reveal-5, .reveal-6, .timeline-item, .mini-card'
    );

    if (reducedMotion || !('IntersectionObserver' in window)) {
        targets.forEach((el) => el.classList.add('is-visible'));
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        let order = 0;

        entries.forEach((entry) => {
            if (!entry.isIntersecting) {
                return;
            }

            const el = entry.target;
            observer.unobserve(el);
            el.classList.add('is-visible');

            // Web Animations keeps the entrance separate from the elements'
            // own hover transitions, so the two never fight.
            el.animate(
                [
                    { opacity: 0, transform: 'translateY(22px)' },
                    { opacity: 1, transform: 'translateY(0)' }
                ],
                {
                    duration: 700,
                    delay: Math.min(order, 6) * 70,
                    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
                    fill: 'backwards'
                }
            );

            order++;
        });
    }, { threshold: 0.05, rootMargin: '0px 0px -5% 0px' });

    targets.forEach((el) => observer.observe(el));
}

// Lenis eases wheel scrolling on desktop. Touch devices keep native scrolling,
// which is already smooth and should not be overridden.
async function setupSmoothScroll() {
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    if (reducedMotion || !finePointer) {
        return;
    }

    try {
        const { default: Lenis } = await import(LENIS_URL);
        const lenis = new Lenis({ lerp: 0.12, anchors: true });

        const raf = (time) => {
            lenis.raf(time);
            requestAnimationFrame(raf);
        };

        requestAnimationFrame(raf);
    } catch (error) {
        // CDN unreachable: native scrolling still works.
    }
}

// Fetches the next page when a link is hovered or touched so navigation
// (and its view transition) starts without a network wait.
function setupPrefetch() {
    if (HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules')) {
        const rules = document.createElement('script');
        rules.type = 'speculationrules';
        rules.textContent = JSON.stringify({
            prefetch: [{ where: { href_matches: '/*' }, eagerness: 'moderate' }]
        });
        document.head.append(rules);
        return;
    }

    const prefetched = new Set([location.pathname]);

    const prefetch = (event) => {
        const link = event.target.closest && event.target.closest('a[href]');

        if (!link || link.origin !== location.origin || link.target === '_blank' || prefetched.has(link.pathname)) {
            return;
        }

        prefetched.add(link.pathname);

        const hint = document.createElement('link');
        hint.rel = 'prefetch';
        hint.href = link.href;
        document.head.append(hint);
    };

    document.addEventListener('pointerover', prefetch, { passive: true });
    document.addEventListener('touchstart', prefetch, { passive: true });
}

function loadBackgroundState(particleCount) {
    try {
        const saved = JSON.parse(sessionStorage.getItem(BACKGROUND_STATE_KEY));

        if (
            saved &&
            saved.positions.length === particleCount * 3 &&
            saved.velocities.length === particleCount * 3 &&
            saved.colorIndices.length === particleCount
        ) {
            return saved;
        }
    } catch (error) {
        // Missing, blocked, or malformed state: start fresh.
    }

    return null;
}

async function setupBackground() {
    const canvas = document.getElementById('webgl');

    if (!canvas) {
        return;
    }

    canvas.setAttribute('aria-hidden', 'true');

    const allowInteractiveBackground =
        document.body.dataset.background === 'interactive' &&
        !reducedMotion &&
        window.innerWidth > 900;

    if (!allowInteractiveBackground) {
        return;
    }

    let THREE;

    try {
        THREE = await import('three');
    } catch (error) {
        return;
    }

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xffffff, 0.045);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 6;

    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    const particleCount = 140;
    const connectionDistance = 1.8;
    const connectionDistanceSq = connectionDistance * connectionDistance;
    const bounds = 7;
    const speed = 0.004;

    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const colorIndices = new Uint8Array(particleCount);
    const palette = [
        new THREE.Color('#0056b3'),
        new THREE.Color('#6f42c1'),
        new THREE.Color('#20c997'),
        new THREE.Color('#2ac8eb')
    ];

    const group = new THREE.Group();

    // Carry the particle field over from the previous page so the background
    // keeps drifting through a navigation instead of reshuffling.
    const saved = loadBackgroundState(particleCount);

    if (saved) {
        positions.set(saved.positions);
        velocities.set(saved.velocities);
        colorIndices.set(saved.colorIndices);
        group.rotation.x = saved.rotationX || 0;
        group.rotation.y = saved.rotationY || 0;
    } else {
        const direction = new THREE.Vector3();

        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 15;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 15;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 15;

            direction
                .set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
                .normalize()
                .multiplyScalar(speed);

            velocities[i * 3] = direction.x;
            velocities[i * 3 + 1] = direction.y;
            velocities[i * 3 + 2] = direction.z;

            colorIndices[i] = Math.floor(Math.random() * palette.length);
        }
    }

    for (let i = 0; i < particleCount; i++) {
        const color = palette[colorIndices[i] % palette.length];
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }

    const particlesGeometry = new THREE.BufferGeometry();
    particlesGeometry.setDrawRange(0, particleCount);
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const pointCloud = new THREE.Points(
        particlesGeometry,
        new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.12,
            vertexColors: true,
            transparent: true,
            opacity: 0.78
        })
    );

    // Each unordered pair can form one segment: two vertices of three floats.
    const maxPairs = (particleCount * (particleCount - 1)) / 2;
    const linePositions = new Float32Array(maxPairs * 6);
    const lineColors = new Float32Array(maxPairs * 6);
    const linesGeometry = new THREE.BufferGeometry();
    linesGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage));
    linesGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3).setUsage(THREE.DynamicDrawUsage));

    const linesMesh = new THREE.LineSegments(
        linesGeometry,
        new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.28
        })
    );

    group.add(pointCloud);
    group.add(linesMesh);
    scene.add(group);

    let mouseX = 0;
    let mouseY = 0;
    let animationFrameId = 0;
    let lastTime = 0;

    window.addEventListener('mousemove', (event) => {
        mouseX = (event.clientX / window.innerWidth) * 2 - 1;
        mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
    }, { passive: true });

    const animate = (time) => {
        animationFrameId = requestAnimationFrame(animate);

        // Scale motion by elapsed time so speed is the same on 60Hz and
        // 120Hz displays; clamp so a background tab does not jump on return.
        const step = lastTime ? Math.min((time - lastTime) / 16.667, 3) : 1;
        lastTime = time;

        let vertexPos = 0;
        let colorPos = 0;
        let numConnected = 0;

        const easing = 1 - Math.pow(1 - 0.018, step);
        group.rotation.y += easing * (mouseX * 0.14 - group.rotation.y);
        group.rotation.x += easing * (mouseY * 0.14 - group.rotation.x);

        for (let i = 0; i < particleCount; i++) {
            const ix = i * 3;
            const px = positions[ix] += velocities[ix] * step;
            const py = positions[ix + 1] += velocities[ix + 1] * step;
            const pz = positions[ix + 2] += velocities[ix + 2] * step;

            // Point the velocity back inward rather than flipping it, so a
            // particle past the edge cannot get stuck oscillating there.
            if (px < -bounds) velocities[ix] = Math.abs(velocities[ix]);
            else if (px > bounds) velocities[ix] = -Math.abs(velocities[ix]);
            if (py < -bounds) velocities[ix + 1] = Math.abs(velocities[ix + 1]);
            else if (py > bounds) velocities[ix + 1] = -Math.abs(velocities[ix + 1]);
            if (pz < -bounds) velocities[ix + 2] = Math.abs(velocities[ix + 2]);
            else if (pz > bounds) velocities[ix + 2] = -Math.abs(velocities[ix + 2]);

            for (let j = i + 1; j < particleCount; j++) {
                const jx = j * 3;
                const dx = px - positions[jx];
                const dy = py - positions[jx + 1];
                const dz = pz - positions[jx + 2];
                const distSq = dx * dx + dy * dy + dz * dz;

                if (distSq >= connectionDistanceSq) {
                    continue;
                }

                linePositions[vertexPos++] = px;
                linePositions[vertexPos++] = py;
                linePositions[vertexPos++] = pz;
                linePositions[vertexPos++] = positions[jx];
                linePositions[vertexPos++] = positions[jx + 1];
                linePositions[vertexPos++] = positions[jx + 2];

                lineColors[colorPos++] = colors[ix];
                lineColors[colorPos++] = colors[ix + 1];
                lineColors[colorPos++] = colors[ix + 2];
                lineColors[colorPos++] = colors[jx];
                lineColors[colorPos++] = colors[jx + 1];
                lineColors[colorPos++] = colors[jx + 2];

                numConnected++;
            }
        }

        linesGeometry.setDrawRange(0, numConnected * 2);
        linesGeometry.attributes.position.needsUpdate = true;
        linesGeometry.attributes.color.needsUpdate = true;
        particlesGeometry.attributes.position.needsUpdate = true;

        renderer.render(scene, camera);
    };

    const start = () => {
        cancelAnimationFrame(animationFrameId);
        lastTime = 0;
        animationFrameId = requestAnimationFrame(animate);
    };

    start();
    canvas.classList.add('is-ready');

    let resizeFrame = 0;

    window.addEventListener('resize', () => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
    });

    // Pause and save on the way out, but keep the renderer alive: the page may
    // be restored from the back/forward cache, where a disposed renderer would
    // leave a frozen canvas.
    window.addEventListener('pagehide', () => {
        cancelAnimationFrame(animationFrameId);

        try {
            sessionStorage.setItem(BACKGROUND_STATE_KEY, JSON.stringify({
                positions: Array.from(positions, (value) => Math.round(value * 1000) / 1000),
                velocities: Array.from(velocities),
                colorIndices: Array.from(colorIndices),
                rotationX: group.rotation.x,
                rotationY: group.rotation.y
            }));
        } catch (error) {
            // Storage unavailable: the next page simply starts a fresh field.
        }
    });

    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            start();
        }
    });
}
