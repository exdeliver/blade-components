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
uniform vec4 u_occ[3];
uniform float u_occSoft[3];
uniform float u_occCount;
uniform vec4 u_cast[3];
uniform float u_castCount;
uniform vec2 u_castDir;
uniform float u_castSpread;

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

// Occluded light: the neighbour rectangle, scaled away from the light
// (as a shape hovering between light and plane would project), is the
// light's shadow. Inside is fully occluded, the band of width soft
// around the projected silhouette is the penumbra — thin for occluders
// close to the light (sharp edge), wide for distant ones.
float lightShadow(vec2 p, vec2 l, vec4 occ, float soft) {
    vec2 lo = l + (occ.xy - l) * (1.0 + soft * 3.0);
    vec2 hi = l + (occ.xy + occ.zw - l) * (1.0 + soft * 3.0);

    if (p.x < lo.x || p.x > hi.x || p.y < lo.y || p.y > hi.y) {
        return 1.0;
    }

    float band = min(min(p.x - lo.x, hi.x - p.x), min(p.y - lo.y, hi.y - p.y));

    return smoothstep(0.0, soft, band);
}

// One single hard shadow, one hovered control. A true wedge: apex at
// the control's light-facing corner, two — and only two — perfectly
// straight edge rays diverging down the fixed top-right to bottom-left
// key direction. No flare kinks, no notches; the tip simply fades.
float cross2(vec2 a, vec2 b) {
    return a.x * b.y - a.y * b.x;
}

float castFan(vec2 p, vec4 c, vec2 e, vec2 dir, float tanS) {
    vec2 apex = (c.xy - 0.5) * e;
    vec2 v = p - apex;
    float t = dot(v, dir);

    if (t <= 0.0) {
        return 0.0;
    }

    float edge = t * tanS;
    float dSide = edge - abs(cross2(dir, v));

    if (dSide < 0.0) {
        return 0.0;
    }

    float len = min(1.7, 0.85 + (c.z + c.w) * 2.2);
    float feather = smoothstep(0.0, 0.006, dSide);
    float tip = 1.0 - smoothstep(len * 0.62, len, t);

    return feather * tip;
}

void main() {
    float t = u_time;
    vec2 e = max(u_size, vec2(0.001));

    // Aspect-corrected, element-centred space (y-up, GL orientation).
    vec2 p = (v_uv - 0.5) * e;

    // --- drifting blobs, each casting the neighbour shadows -------
    float blobs = 0.0;
    float occl = 1.0;

    for (int i = 0; i < 3; i++) {
        float o = float(i) * 2.4;
        vec2 c = vec2(sin(t * 0.085 + o), cos(t * 0.062 + o * 1.7)) * vec2(0.34, 0.30);
        c *= e;
        float r2 = 0.16 + 0.05 * sin(t * 0.11 + o * 3.1);
        vec2 d = p - c;
        float l = falloff(dot(d, d), r2);
        float sh = 1.0;

        for (int j = 0; j < 3; j++) {
            if (float(j) >= u_occCount) {
                break;
            }

            sh *= lightShadow(p, c, vec4((u_occ[j].xy - 0.5) * e, u_occ[j].zw * e), u_occSoft[j]);
        }

        blobs += l * (0.08 + 0.92 * sh);
        occl = min(occl, sh);
    }

    blobs /= 2.4;

    // --- edge light ------------------------------------------------
    vec2 edge = min(v_uv, 1.0 - v_uv) * e;
    float edgeLight = falloff(min(edge.x, edge.y) * min(edge.x, edge.y), 0.012);

    // --- pointer light ----------------------------------------------
    vec2 pl = (vec2(u_pointer.x, 1.0 - u_pointer.y) - 0.5) * e;
    vec2 pd = p - pl;
    float glow = falloff(dot(pd, pd), 0.10) * u_pointer.w;

    float psh = 1.0;

    for (int j = 0; j < 3; j++) {
        if (float(j) >= u_occCount) {
            break;
        }

        psh *= lightShadow(p, pl, vec4((u_occ[j].xy - 0.5) * e, u_occ[j].zw * e), u_occSoft[j]);
    }

    glow *= 0.08 + 0.92 * psh;


    // The single cast fan, scaled by how strongly its owner is lit.
    float castCut = 0.0;

    if (u_castCount > 0.0) {
        castCut = clamp(castFan(p, u_cast[0], e, u_castDir, u_castSpread) * u_castCount, 0.0, 1.0);
    }

    // Coherent shading: light is stronger near the top (ambient from
    // above) and gathers where a source already lights the edge.
    float light = blobs * 0.38 + edgeLight * 0.16 + glow * 0.75;
    light *= mix(0.85, 1.0, v_uv.y);
    light += edgeLight * glow * 0.45;
    light *= 1.0 - 0.92 * castCut;

    float shadow = clamp(1.0 - min(occl, 1.0 - castCut), 0.0, 1.0);

    float alpha = clamp(u_strength * 0.02 + light * u_strength * 0.40 + shadow * 0.14, 0.0, 0.42);
    vec3 col = min(u_color * (1.0 + light * 0.45 + glow * 0.25), vec3(1.0));
    col *= 1.0 - shadow * 0.78;

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
        // preserveDrawingBuffer is NOT needed: blits read the buffer in
        // the same task that drew it, and preserved buffers significantly
        // raise GPU memory and compositor pressure per reallocation.
        gl = canvas.getContext('webgl2', { alpha: true, antialias: false })
            || canvas.getContext('webgl', { alpha: true, antialias: false })
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
            occ: gl.getUniformLocation(program, 'u_occ[0]'),
            occSoft: gl.getUniformLocation(program, 'u_occSoft[0]'),
            occCount: gl.getUniformLocation(program, 'u_occCount'),
            cast: gl.getUniformLocation(program, 'u_cast[0]'),
            castCount: gl.getUniformLocation(program, 'u_castCount'),
            castDir: gl.getUniformLocation(program, 'u_castDir'),
            castSpread: gl.getUniformLocation(program, 'u_castSpread'),
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

const occBuf = new Float32Array(12)
const occSoftBuf = new Float32Array(3)
const castBuf = new Float32Array(12)

// Elements tagged data-bc-caster hover over the surfaces and throw a
// direct cutting shadow across whatever they cover. They own no canvas
// — they are pure occluders for every surface within reach.
const casters = []

const INTERACTIVE = 'button, [role="button"], a[href], input, select, textarea, [role="menuitem"], [role="tab"], [role="checkbox"], [role="switch"], [data-bc-caster]'

// Interactable controls over a surface, refreshed on structural
// changes; rectangles keep up with events via measureAll.
const refreshCasts = (entry) => {
    entry.castEls = [...entry.el.querySelectorAll(INTERACTIVE)].filter((el) => {
        if (el === entry.el || el.tagName === 'CANVAS') {
            return false
        }

        const r = el.getBoundingClientRect()

        el.__bcCastRect = r.width >= 6 && r.height >= 6 ? r : null

        return el.__bcCastRect !== null
    })
}

const scanCasters = (root) => {
    const nodes = [...(root.querySelectorAll?.('[data-bc-caster]') || [])]

    if (root.matches?.('[data-bc-caster]')) {
        nodes.unshift(root)
    }

    for (const el of nodes) {
        if (! casters.some((c) => c.el === el)) {
            casters.push({ el, rect: el.getBoundingClientRect() })
        }
    }
}

// Rectangles are measured on events (resize, scroll, pointer, theme,
// route swaps) — NEVER inside the frame loop: a getBoundingClientRect
// there forces layout 60 times a second and churns canvas backing
// stores on compositor layers (visible as flickering white patches).
let measurePending = false

const measureAll = () => {
    measurePending = false

    for (const entry of entries) {
        if (entry.el.isConnected) {
            entry.rect = entry.el.getBoundingClientRect()
        }
    }

    for (const caster of casters) {
        if (caster.el.isConnected) {
            caster.rect = caster.el.getBoundingClientRect()
        }
    }

    for (const entry of entries) {
        for (const el of entry.castEls) {
            const r = el.getBoundingClientRect()

            el.__bcCastRect = r.width >= 6 && r.height >= 6 ? r : null
        }
    }
}

const scheduleMeasure = () => {
    measurePending ||= false

    if (! measurePending) {
        measurePending = true
        requestAnimationFrame(measureAll)
    }
}

// The nearest other surfaces, as rectangles in this surface's uv space
// (y up), plus a penumbra width that grows the farther an occluder sits
// from the surface — close neighbours cast sharp-edged shadows, distant
// ones blur out.
const collectOccluders = (entry) => {
    const rect = entry.rect

    if (! rect || rect.width < 1) {
        return 0
    }

    const reach = Math.max(rect.width, rect.height) * 1.4
    const candidates = []

    for (const other of entries) {
        const o = other.rect

        if (other === entry || ! o || o.width < 8 || o.height < 8) {
            continue
        }

        const dx = Math.max(o.left - rect.right, rect.left - o.right, 0)
        const dy = Math.max(o.top - rect.bottom, rect.top - o.bottom, 0)
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist <= reach) {
            candidates.push([dist, o])
        }
    }

    candidates.sort((a, b) => a[0] - b[0])

    let n = 0

    for (const [dist, o] of candidates) {
        if (n === 3) {
            break
        }

        occBuf[n * 4] = (o.left - rect.left) / rect.width
        occBuf[n * 4 + 1] = 1 - (o.bottom - rect.top) / rect.height
        occBuf[n * 4 + 2] = o.width / rect.width
        occBuf[n * 4 + 3] = o.height / rect.height
        occSoftBuf[n] = Math.min(0.14, 0.010 + (dist / Math.max(rect.width, rect.height)) * 0.09)

        n++
    }

    return n
}

// One shadow, one owner — and only while hovering. The control under
// the pointer takes the cast slot; the shadow's strength eases in and
// out (never snaps), and its direction is the fixed top-right to
// bottom-left key cut, allowed to sway with the mouse by only a few
// degrees before it is clamped and eased.
const CAST_BASE = -2.3561945
const CAST_KEY_X = -0.7071
const CAST_KEY_Y = -0.7071

const collectCasters = (entry) => {
    const rect = entry.rect
    const pointer = entry.pointer

    // Ease the strength toward "hovering something" — fades in/out.
    const ease = entry.castEase ?? 0
    let hover = null

    if (rect && rect.width > 1 && pointer.w > 0.35) {
        const px = pointer.x
        const py = 1 - pointer.y
        let bestArea = Infinity

        const test = (o) => {
            if (! o || o.width < 4 || o.height < 4) {
                return
            }

            const x = (o.left - rect.left) / rect.width
            const y = 1 - (o.bottom - rect.top) / rect.height
            const w = o.width / rect.width
            const h = o.height / rect.height

            if (px < x || px > x + w || py < y || py > y + h) {
                return
            }

            const area = w * h

            if (area < bestArea) {
                bestArea = area
                hover = { x, y, w, h }
            }
        }

        for (const el of entry.castEls) {
            test(el.__bcCastRect)
        }

        for (const caster of casters) {
            if (! entry.el.contains(caster.el)) {
                test(caster.rect)
            }
        }
    }

    if (hover) {
        entry.castHover = hover
    }

    const target = hover ? 1 : 0
    const val = ease + (target - ease) * 0.07

    entry.castEase = val

    if (val < 0.01 || ! entry.castHover) {
        entry.castEase = target === 0 ? 0 : val

        return 0
    }

    const hv = entry.castHover

    // Cut direction: always the key diagonal, top-right to bottom
    // left. Eased once on entry so nothing snaps; no sway.
    const a = entry.castDirA ?? CAST_BASE
    let step = CAST_BASE - a

    step = Math.atan2(Math.sin(step), Math.cos(step))

    entry.castDirA = a + step * 0.08
    entry.castDirX = Math.cos(entry.castDirA)
    entry.castDirY = Math.sin(entry.castDirA)

    // Wedge half-angle from the control's size — big control, big
    // shadow — eased so switching casters never snaps.
    const spreadWant = 0.12 + Math.min(0.18, (hv.w + hv.h) * 1.2)
    const easedSpread = entry.castSpreadWant === undefined
        ? spreadWant
        : entry.castSpreadWant + (spreadWant - entry.castSpreadWant) * 0.08

    entry.castSpreadWant = spreadWant
    entry.castSpread = Math.tan(easedSpread)

    castBuf[0] = hv.x
    castBuf[1] = hv.y
    castBuf[2] = hv.w
    castBuf[3] = hv.h

    return Math.min(val, 1.0)
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

    const occCount = collectOccluders(entry)

    gl.uniform1f(uniforms.occCount, occCount)

    if (occCount > 0) {
        gl.uniform4fv(uniforms.occ, occBuf)
        gl.uniform1fv(uniforms.occSoft, occSoftBuf)
    }

    const castCount = collectCasters(entry)

    gl.uniform1f(uniforms.castCount, castCount)
    gl.uniform2f(uniforms.castDir, entry.castDirX, entry.castDirY)
    gl.uniform1f(uniforms.castSpread, entry.castSpread)

    if (castCount > 0) {
        gl.uniform4fv(uniforms.cast, castBuf)
    }

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

    for (let i = casters.length - 1; i >= 0; i--) {
        if (! casters[i].el.isConnected) {
            casters.splice(i, 1)
        }
    }

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
        castEls: [],
        castEase: 0,
        castDirX: CAST_KEY_X,
        castSpread: 0.12,
        castDirY: CAST_KEY_Y,
        visible: true,
        width: 0,
        height: 0,
        rect: null,
        rgb: null,
        pointer: { x: 0.5, y: 0.5, w: 0, target: 0 },
        ro: null,
        io: null,
    }

    const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, maxDpr)
        const width = Math.max(1, Math.round(el.clientWidth * dpr))
        const height = Math.max(1, Math.round(el.clientHeight * dpr))

        entry.rect = el.getBoundingClientRect()

        if (width !== entry.width || height !== entry.height) {
            entry.width = width
            entry.height = height
            canvas.width = width
            canvas.height = height
        }

        schedule()
    }

    el.addEventListener('pointermove', (ev) => {
        const rect = (entry.rect = el.getBoundingClientRect())

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
    refreshCasts(entry)

    entry.io.observe(el)

    resize()
}

const scan = (scope) => {
    scanCasters(scope)

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
        measureAll()
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
        let added = false

        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node.nodeType === 1) {
                    scan(node)
                    added = true
                }
            }
        }

        if (added) {
            for (const entry of entries) {
                refreshCasts(entry)
            }

            scheduleMeasure()
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
            scheduleMeasure()
            schedule()
        }
    })

    // Capture catches scroll inside any container (board columns).
    window.addEventListener('scroll', scheduleMeasure, { capture: true, passive: true })
    window.addEventListener('resize', scheduleMeasure, { passive: true })

    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
        schedule()
    })
}
