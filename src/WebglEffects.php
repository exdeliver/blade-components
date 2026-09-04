<?php

declare(strict_types=1);

namespace DistortedFusion\BladeComponents;

/**
 * Renders the `blade-components.webgl` configuration.
 *
 * The browser half (which component keys are enabled, the glow intensity
 * and the render-resolution cap) is embedded on `window.DDFSN.webgl` by
 * AssetManager::ddfsnAppearance(); the JavaScript layer in
 * resources/js/webgl.js does the rendering. This class also emits the
 * small CSS contract the renderer relies on: an active element becomes an
 * isolated positioning context, its canvas fills it behind the content,
 * and the static CSS tint gradient steps aside for the live glow.
 *
 * @see AssetManager::ddfsnAppearance()
 * @see ThemeManager::renderStyles()
 */
class WebglEffects
{
    /**
     * Whether any WebGL surface effects may render at all.
     */
    public static function enabled(): bool
    {
        $config = config('blade-components.webgl', []);

        return filter_var($config['enabled'] ?? false, FILTER_VALIDATE_BOOLEAN);
    }

    /**
     * The configuration as embedded on window.DDFSN.webgl.
     *
     * @return array<string, mixed>
     */
    public static function browserConfig(): array
    {
        $config = config('blade-components.webgl', []);

        $components = [];

        foreach ((array) ($config['components'] ?? []) as $key => $value) {
            $components[(string) $key] = filter_var($value, FILTER_VALIDATE_BOOLEAN);
        }

        return [
            'enabled' => static::enabled(),
            'components' => (object) $components,
            'intensity' => max(0.0, min(2.0, (float) ($config['intensity'] ?? 1.0))),
            'maxDpr' => max(1.0, min(3.0, (float) ($config['max_dpr'] ?? 1.5))),
        ];
    }

    /**
     * The CSS contract for rendered elements, appended to the stylesheet
     * served by @ddfsnStyles (and therefore part of its cache-bust hash).
     * Nothing is emitted while the effect is disabled.
     */
    public static function render(): string
    {
        if (! static::enabled()) {
            return '';
        }

        return <<<'CSS'
/* WebGL surface effects (config: blade-components.webgl) */
.bc-webgl-active {
    position:relative;
    isolation:isolate;
}

canvas.bc-webgl-canvas {
    position:absolute;
    inset:0;
    width:100%;
    height:100%;
    border-radius:inherit;
    pointer-events:none;
    z-index:-1;
}

/* The live glow replaces the static tint gradient; the flat tinted
   background colour remains, so a disabled or fallen-back element is
   indistinguishable from a rendered one at rest. */
.bc-webgl-active.bc-surface {
    background-image:none;
}

/* .bc-depth — a recessed content panel living on a live surface (the
   issue dialog's tab body). Its own semi-opaque tint veil paints over
   the glow canvas underneath: the ambient rig still grazes its edge,
   but the cutting shadow can no longer sink the panel's contents, and
   the inset hairline gives the section its own depth step below the
   surface. Mixes toward --background, so the recess reads darker on
   dark themes and lighter on light ones, like the page behind. */
.bc-depth {
    position:relative;
}
.bc-depth::before {
    content:"";
    position:absolute;
    inset:0;
    z-index:-1;
    pointer-events:none;
    background-color:color-mix(in oklab, var(--muted) 68%, var(--background));
    opacity:.88;
    box-shadow:inset 0 1px 0 color-mix(in oklab, var(--foreground) 8%, transparent);
}

CSS;
    }
}
