/**
 * WebGL surface effects.
 *
 * Elements opt in with `data-bc-webgl="<component>"`. When the
 * `blade-components.webgl` configuration (embedded on window.DDFSN.webgl
 * by the @ddfsnAppearance script) is enabled and the component key is not
 * switched off, a small canvas is mounted inside the element and renders
 * the surface tint as a live glow — three soft blobs of the tint colour
 * drifting behind the content. The canvas sits behind everything (the
 * element gets `.bc-webgl-active`, whose CSS places the canvas at
 * z-index:-1 inside an isolated stacking context), and the static CSS
 * tint gradient steps aside while it runs.
 *
 * Degradation is silent by design: no WebGL context, reduced motion
 * (static frame), hidden tab or off-screen element (paused), element
 * removed from the document (released). The element keeps its plain CSS
 * tint in every one of those cases.
 */

const ACTIVE_CLASS = 'bc-webgl-active'
const CANVAS_CLASS = 'bc-webgl-canvas'

const VERTEX_SOURCE = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main () {
    v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
    gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

// Three drifting radial blobs over the element's box (v_uv.y runs 0 at the
// top, matching the CSS gradient direction). Premultiplied output against
// ONE / ONE_MINUS_SRC_ALPHA.
const FRAGMENT_SOURCE = `
precision mediump float;
varying vec2 v_uv;
uniform float u_time;
uniform vec3 u_color;
uniform float u_strength;
uniform vec2 u_aspect;
void main () {
    float t = u_time;
    vec2 d1 = (v_uv - vec2(0.25 + 0.10 * sin(t * 0.21), 0.18 + 0.08 * cos(t * 0.17))) * u_aspect;
    vec2 d2 = (v_uv - vec2(0.78 + 0.12 * cos(t * 0.13), 0.35 + 0.14 * sin(t * 0.19))) * u_aspect;
    vec2 d3 = (v_uv - vec2(0.50 + 0.16 * sin(t * 0.11 + 2.0), 0.95 + 0.10 * sin(t * 0.15 + 1.0))) * u_aspect;
    float a = exp(-dot(d1, d1) * 3.2) + exp(-dot(d2, d2) * 4.5) * 0.8 + exp(-dot(d3, d3) * 2.2) * 0.7;
    float alpha = clamp(u_strength * a * 0.55, 0.0, 0.85);
    gl_FragColor = vec4(u_color * alpha, alpha);
}
`

let booted = false
let entries = []
let frame = null
let probe = null
let tint = { color: [0.357, 0.42, 1.0], strength: 0 }

const reducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

const config = () => (window.DDFSN && window.DDFSN.webgl) || null

const keyEnabled = (key) => {
    const cfg = config()
    const map = cfg && cfg.components

    return ! map || map[key] === undefined ? true : map[key] === true
}

// Resolve any CSS colour (var, hex, name) through the engine itself.
const resolveColor = (value) => {
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

    const computed = getComputedStyle(probe).color || 'rgb(91, 108, 255)'
    const numbers = computed.match(/[\d.]+/g)

    if (! numbers || numbers.length < 3) {
        return [0.357, 0.42, 1.0]
    }

    return [
        Math.min(1, parseFloat(numbers[0]) / 255),
        Math.min(1, parseFloat(numbers[1]) / 255),
        Math.min(1, parseFloat(numbers[2]) / 255),
    ]
}

const refreshTint = () => {
    const root = getComputedStyle(document.documentElement)

    tint = {
        color: resolveColor(root.getPropertyValue('--tint').trim() || null),
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

const draw = (entry, seconds) => {
    const { gl, program, uniforms, width, height } = entry
    const cfg = config() || {}
    const intensity = cfg.intensity === undefined ? 1 : cfg.intensity

    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(program)
    gl.uniform1f(uniforms.time, seconds)
    gl.uniform3fv(uniforms.color, tint.color)
    gl.uniform1f(uniforms.strength, Math.min(1, (0.35 + tint.strength * 0.65) * intensity))
    gl.uniform2f(uniforms.aspect, Math.max(1, width / Math.max(height, 1)), 1)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
}

const paint = (entry) => draw(entry, performance.now() / 1000)

const tick = () => {
    frame = null

    const seconds = performance.now() / 1000
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

        if (entry.visible) {
            anyVisible = true

            draw(entry, seconds)
        }
    }

    if (entries.length === 0 || document.hidden || reducedMotion() || ! anyVisible) {
        // Parked: an IntersectionObserver (back on screen), the
        // visibilitychange or the reduced-motion listener resumes.
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

    const cfg = config() || {}
    const maxDpr = cfg.maxDpr === undefined ? 1.5 : cfg.maxDpr

    const canvas = document.createElement('canvas')
    canvas.className = CANVAS_CLASS
    canvas.setAttribute('aria-hidden', 'true')

    const gl = (() => {
        try {
            return canvas.getContext('webgl2', { alpha: true, antialias: false })
                || canvas.getContext('webgl', { alpha: true, antialias: false })
        } catch (e) {
            return null
        }
    })()

    if (! gl) {
        return
    }

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE)
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE)

    if (! vertex || ! fragment) {
        return
    }

    const program = gl.createProgram()

    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)

    if (! gl.getProgramParameter(program, gl.LINK_STATUS)) {
        return
    }

    // One fullscreen triangle; no per-element buffer churn.
    const buffer = gl.createBuffer()

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)

    const position = gl.getAttribLocation(program, 'a_pos')

    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    const entry = {
        el,
        canvas,
        gl,
        program,
        uniforms: {
            time: gl.getUniformLocation(program, 'u_time'),
            color: gl.getUniformLocation(program, 'u_color'),
            strength: gl.getUniformLocation(program, 'u_strength'),
            aspect: gl.getUniformLocation(program, 'u_aspect'),
        },
        visible: true,
        width: 0,
        height: 0,
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

            paint(entry)
        }

        schedule()
    }

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

        for (const entry of entries) {
            paint(entry)
        }
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
