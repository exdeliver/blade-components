/**
 * WebGL surface effects.
 *
 * Elements opt in with `data-bc-webgl="<component>"`. When the
 * `blade-components.webgl` configuration (embedded on window.DDFSN.webgl
 * by the @ddfsnAppearance script) is enabled and the component key is not
 * switched off, a small canvas is mounted inside the element and renders
 * the surface tint as a live glow — a coherent ambient light rig: slow
 * drifting light blobs, a soft bleed along the edges and a pointer
 * light, sharing one distance falloff, painting the component's own
 * surface colour. The canvas sits behind everything (the element gets
 * `.bc-webgl-active`, whose CSS places the canvas at z-index:-1 inside an
 * isolated stacking context), and the static CSS tint gradient steps
 * aside while it runs.
 *
 * One WebGL context serves the whole page: every registered surface is
 * packed into an offscreen atlas rendered by a single master context,
 * and each element's own canvas is a plain 2D canvas blitting its slice
 * of the atlas in the same frame. Browsers cap live WebGL contexts
 * (roughly 8-16, evicting the oldest — which on some drivers composites
 * as a white rectangle), so a per-element context cannot back a board of
 * two dozen cards; 2D canvases have no such cap.
 *
 * Degradation is silent by design: no WebGL context, hidden tab or
 * off-screen element (paused), element removed from the document
 * (released), reduced motion (static frame). The element keeps its plain
 * CSS tint in every one of those cases.
 */

const ACTIVE_CLASS = 'bc-webgl-active'
const CANVAS_CLASS = 'bc-webgl-canvas'

const VERTEX_SOURCE = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main () {
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

// Premultiplied output against ONE / ONE_MINUS_SRC_ALPHA; the canvas
// blit keeps this in the element's own orientation.
const FRAGMENT_SOURCE = `
precision highp float;
varying vec2 v_uv;
uniform float u_time;
uniform vec3 u_color;
uniform float u_strength;
uniform vec2 u_size;
uniform vec4 u_pointer;

// One coherent light rig for the whole surface: three slow drifting
// light blobs, a soft area light bleeding in from the edges, the
// pointer light, and a gentle ambient from above. Every source uses
// the same exp(-d^2 / r^2) falloff, so the field always reads as one
// physically consistent lighting setup rather than animated noise.

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float falloff(float d2, float r2) {
    return exp(-d2 / r2);
}

void main() {
    float t = u_time;
    vec2 e = max(u_size, vec2(0.001));

    // Aspect-corrected, element-centred space (y-up, GL orientation).
    vec2 p = (v_uv - 0.5) * e;

    // --- drifting blobs -------------------------------------------
    float blobs = 0.0;

    for (int i = 0; i < 3; i++) {
        float o = float(i) * 2.4;
        vec2 c = vec2(sin(t * 0.085 + o), cos(t * 0.062 + o * 1.7)) * vec2(0.34, 0.30);
        c *= e;
        float r2 = 0.16 + 0.05 * sin(t * 0.11 + o * 3.1);
        vec2 d = p - c;
        blobs += falloff(dot(d, d), r2);
    }

    blobs /= 2.4;

    // --- edge light ------------------------------------------------
    vec2 edge = min(v_uv, 1.0 - v_uv) * e;
    float edgeLight = falloff(min(edge.x, edge.y) * min(edge.x, edge.y), 0.012);

    // --- pointer light ----------------------------------------------
    vec2 pd = p - (vec2(u_pointer.x, 1.0 - u_pointer.y) - 0.5) * e;
    float glow = falloff(dot(pd, pd), 0.10) * u_pointer.w;

    // Coherent shading: light is stronger near the top (ambient from
    // above) and gathers where a source already lights the edge.
    float light = blobs * 0.38 + edgeLight * 0.16 + glow * 0.75;
    light *= mix(0.85, 1.0, v_uv.y);
    light += edgeLight * glow * 0.45;

    float alpha = clamp(u_strength * 0.02 + light * u_strength * 0.40, 0.0, 0.35);
    vec3 col = min(u_color * (1.0 + light * 0.45 + glow * 0.25), vec3(1.0));

    alpha += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
    alpha = clamp(alpha, 0.0, 0.35);

    gl_FragColor = vec4(col * alpha, alpha);
}
`

let booted = false
let entries = []
let frame = null
let probe = null
let tint = { color: [0.357, 0.42, 1.0], strength: 0 }
let master = null

const reducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

const config = () => (window.DDFSN && window.DDFSN.webgl) || null

const keyEnabled = (key) => {
    const cfg = config()
    const map = cfg && cfg.components

    return ! map || map[key] === undefined ? true : map[key] === true
}

// Normalise any CSS colour (hex, name, oklch, color-mix) to [r,g,b] in
// 0..1 sRGB: variables are resolved through a hidden probe, then the
// 2D canvas parser serialises the result back to plain hex, whatever
// colour space the engine computed it in.
let rgb255 = null

const parseColor = (value) => {
    if (! probe) {
        probe = document.createElement('span')
        probe.style.display = 'none'
    }

    if (! probe.isConnected) {
        ;(document.body || document.documentElement).appendChild(probe)
    }

    probe.style.color = ''

    if (value) {
        probe.style.color = value
    }

    const computed = getComputedStyle(probe).color

    rgb255 ??= document.createElement('canvas').getContext('2d')

    rgb255.fillStyle = '#000000'
    rgb255.fillStyle = computed || ''

    const hex = rgb255.fillStyle

    if (typeof hex !== 'string' || ! hex.startsWith('#') || hex.length < 7) {
        return null
    }

    return [
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255,
    ]
}

const mixRgb = (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
]

// Light of the surface's own colour: the card background lifted toward
// white, so the silk reads as sheen on the component rather than as a
// coloured overlay.
const sheenOf = (surface) => surface.map((c) => c + (1 - c) * 0.45)

// The surface colours the shader paints with: the element's own sheen,
// blended toward the theme tint only as far as the tint strength asks.
// With tint at 0% the effect is a neutral self-coloured shimmer.
const refreshEntryColor = (entry) => {
    const surface = parseColor(getComputedStyle(entry.el).backgroundColor) || [0.17, 0.18, 0.2]

    entry.rgb = mixRgb(sheenOf(surface), tint.color, tint.strength)
}

const refreshAllColors = () => {
    for (const entry of entries) {
        refreshEntryColor(entry)
    }
}

const refreshTint = () => {
    const root = getComputedStyle(document.documentElement)

    tint = {
        color: parseColor(root.getPropertyValue('--tint').trim()) || [0.357, 0.42, 1.0],
        strength: (parseFloat(root.getPropertyValue('--tint-strength')) || 0) / 100,
    }
}

const compile = (gl, type, source) => {
    const shader = gl.createShader(type)

    gl.shaderSource(shader, source)
    gl.compileShader(shader)

    if (! gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader)

        return null
    }

    return shader
}

// Release every surface to its CSS fallback; the master context died
// (driver reset) or could never be created. One-shot per page session —
// the plain CSS tint stands again everywhere.
const teardownAll = () => {
    master = null

    for (const entry of entries) {
        entry.ro.disconnect()
        entry.io.disconnect()
        entry.el.classList.remove(ACTIVE_CLASS)
        entry.canvas.remove()
    }

    entries = []

    if (frame !== null) {
        cancelAnimationFrame(frame)
        frame = null
    }
}

const ensureMaster = () => {
    if (master) {
        return master
    }

    const canvas = document.createElement('canvas')
    let gl = null

    try {
        gl = canvas.getContext('webgl2', { alpha: true, antialias: false, preserveDrawingBuffer: true })
            || canvas.getContext('webgl', { alpha: true, antialias: false, preserveDrawingBuffer: true })
    } catch (e) {
        gl = null
    }

    if (! gl) {
        return null
    }

    canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault()
        teardownAll()
    })

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE)
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE)

    if (! vertex || ! fragment) {
        return null
    }

    const program = gl.createProgram()

    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)

    if (! gl.getProgramParameter(program, gl.LINK_STATUS)) {
        return null
    }

    // One fullscreen triangle reused for every surface; the per-surface
    // area is selected with the viewport.
    const buffer = gl.createBuffer()

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)

    const position = gl.getAttribLocation(program, 'a_pos')

    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    master = {
        canvas,
        gl,
        buffer,
        program,
        frames: 0,
        draws: 0,
        uniforms: {
            time: gl.getUniformLocation(program, 'u_time'),
            color: gl.getUniformLocation(program, 'u_color'),
            strength: gl.getUniformLocation(program, 'u_strength'),
            size: gl.getUniformLocation(program, 'u_size'),
            pointer: gl.getUniformLocation(program, 'u_pointer'),
        },
    }

    return master
}

// Grow the scratch surface only when a bigger one shows up (rare after
// boot; resizing a canvas reallocates its backing store).
const ensureSize = (m, w, h) => {
    if (w <= m.canvas.width && h <= m.canvas.height) {
        return true
    }

    m.canvas.width = Math.max(m.canvas.width, w, 512)
    m.canvas.height = Math.max(m.canvas.height, h, 512)

    // Resizing the drawing buffer resets the attribute binding.
    m.gl.bindBuffer(m.gl.ARRAY_BUFFER, m.buffer)

    const position = m.gl.getAttribLocation(m.program, 'a_pos')

    m.gl.enableVertexAttribArray(position)
    m.gl.vertexAttribPointer(position, 2, m.gl.FLOAT, false, 0, 0)

    return true
}

const renderSurface = (m, entry, seconds) => {
    const { gl, uniforms } = m
    const cfg = config() || {}
    const intensity = cfg.intensity === undefined ? 1 : cfg.intensity
    const pointer = entry.pointer

    pointer.w = reducedMotion()
        ? pointer.target
        : pointer.w + (pointer.target - pointer.w) * 0.09

    gl.uniform1f(uniforms.time, seconds)
    gl.uniform3fv(uniforms.color, entry.rgb || tint.color)
    gl.uniform1f(uniforms.strength, Math.min(1, (0.35 + tint.strength * 0.65) * intensity))
    gl.uniform2f(uniforms.size, entry.width / Math.max(entry.width, entry.height), entry.height / Math.max(entry.width, entry.height))
    gl.uniform4f(uniforms.pointer, pointer.x, pointer.y, 0, pointer.w)
    gl.viewport(0, m.canvas.height - entry.height, entry.width, entry.height)
    m.draws++
    gl.drawArrays(gl.TRIANGLES, 0, 3)
}

// One scratch pass per surface: clear, render into the scratch bottom
// rows, flip-blit the patch into the element's 2D canvas (GL origin is
// bottom-left, CSS origin top-left).
const render = () => {
    const m = ensureMaster()

    if (! m) {
        teardownAll()

        return false
    }

    const seconds = performance.now() / 1000
    const { gl } = m

    gl.useProgram(m.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buffer)
    m.frames++

    let anyVisible = false

    for (const entry of entries.slice()) {
        if (! entry.el.isConnected) {
            entry.ro.disconnect()
            entry.io.disconnect()
            entry.el.classList.remove(ACTIVE_CLASS)
            entry.canvas.remove()
            entries.splice(entries.indexOf(entry), 1)

            continue
        }

        if (! entry.visible || entry.width < 1 || entry.height < 1) {
            continue
        }

        ensureSize(m, entry.width, entry.height)

        gl.viewport(0, 0, m.canvas.width, m.canvas.height)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)

        renderSurface(m, entry, seconds)

        // A GL viewport at y = H - h lands in the TOP-h rows of the
        // buffer as 2D sees them (GL origin bottom-left, canvas origin
        // top-left) — and the viewport's y-up already matches the
        // element orientation, so the copy is straight, not flipped.
        entry.ctx.clearRect(0, 0, entry.width, entry.height)
        entry.ctx.drawImage(m.canvas, 0, 0, entry.width, entry.height, 0, 0, entry.width, entry.height)

        anyVisible = true
    }

    return anyVisible
}

const tick = () => {
    frame = null

    const anyVisible = render()

    if (entries.length === 0 || document.hidden || reducedMotion() || ! anyVisible) {
        // Parked: an IntersectionObserver (back on screen), the
        // visibilitychange, a pointer move or the reduced-motion
        // listener resumes.
        return
    }

    frame = requestAnimationFrame(tick)
}

const schedule = () => {
    frame ??= requestAnimationFrame(tick)
}

const register = (el) => {
    const key = el.getAttribute('data-bc-webgl')

    if (! key || ! keyEnabled(key)) {
        return
    }

    if (el.querySelector(':scope > canvas.' + CANVAS_CLASS)) {
        return
    }

    if (! ensureMaster()) {
        return
    }

    const cfg = config() || {}
    const maxDpr = cfg.maxDpr === undefined ? 1.5 : cfg.maxDpr

    const canvas = document.createElement('canvas')

    canvas.className = CANVAS_CLASS
    canvas.setAttribute('aria-hidden', 'true')

    const ctx = canvas.getContext('2d')

    if (! ctx) {
        return
    }

    const entry = {
        el,
        canvas,
        ctx,
        visible: true,
        width: 0,
        height: 0,
        rgb: null,
        pointer: { x: 0.5, y: 0.5, w: 0, target: 0 },
        ro: null,
        io: null,
    }

    const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, maxDpr)
        const width = Math.max(1, Math.round(el.clientWidth * dpr))
        const height = Math.max(1, Math.round(el.clientHeight * dpr))

        if (width !== entry.width || height !== entry.height) {
            entry.width = width
            entry.height = height
            canvas.width = width
            canvas.height = height
        }

        schedule()
    }

    el.addEventListener('pointermove', (ev) => {
        const rect = el.getBoundingClientRect()

        entry.pointer.x = (ev.clientX - rect.left) / Math.max(rect.width, 1)
        entry.pointer.y = (ev.clientY - rect.top) / Math.max(rect.height, 1)
        entry.pointer.target = 1

        if (reducedMotion()) {
            schedule()
        }
    })

    el.addEventListener('pointerleave', () => {
        entry.pointer.target = 0

        if (reducedMotion()) {
            schedule()
        }
    })

    entry.ro = new ResizeObserver(resize)
    entry.ro.observe(el)

    entry.io = new IntersectionObserver((records) => {
        let resumed = false

        for (const record of records) {
            entry.visible = record.isIntersecting

            resumed ||= record.isIntersecting
        }

        if (resumed) {
            schedule()
        }
    })

    el.classList.add(ACTIVE_CLASS)
    el.appendChild(canvas)

    entries.push(entry)
    refreshEntryColor(entry)

    entry.io.observe(el)

    resize()
}

const scan = (scope) => {
    const found = scope.matches && scope.matches('[data-bc-webgl]')
        ? [scope]
        : []

    for (const el of scope.querySelectorAll ? scope.querySelectorAll('[data-bc-webgl]') : []) {
        found.push(el)
    }

    for (const el of found) {
        if (! el.closest('.' + ACTIVE_CLASS)) {
            register(el)
        }
    }
}

/**
 * Boot the effect layer. Idempotent; safe before DOM ready. Called by the
 * plugin install (Vue variant) and directly (Blade variant).
 */
export function bootWebgl () {
    if (booted || typeof window === 'undefined' || ! config() || ! config().enabled) {
        return
    }

    booted = true

    // Small debug handle for verification runs; harmless in production.
    window.__bcWebgl = () => ({
        master: master ? { w: master.canvas.width, h: master.canvas.height, frames: master.frames, draws: master.draws } : null,
        entries: entries.map((e) => ({
            w: e.width, h: e.height, visible: e.visible,
            key: e.el.getAttribute('data-bc-webgl'),
        })),
    })

    const start = () => {
        refreshTint()
        scan(document.documentElement)
        schedule()
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true })
    } else {
        start()
    }

    // Inertia re-renders swap whole trees; register late arrivals, and
    // tint changes re-resolve the shader colours live.
    new MutationObserver((records) => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node.nodeType === 1) {
                    scan(node)
                }
            }
        }
    }).observe(document.documentElement, { childList: true, subtree: true })

    document.addEventListener('ddfsn:tint', () => {
        refreshTint()
        refreshAllColors()
        schedule()
    })

    // Theme flips swap the surface colours underneath the effect.
    new MutationObserver(refreshAllColors).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'data-theme', 'data-appearance'],
    })

    document.addEventListener('visibilitychange', () => {
        if (! document.hidden) {
            schedule()
        }
    })

    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
        schedule()
    })
}
