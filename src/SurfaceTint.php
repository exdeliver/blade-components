<?php

declare(strict_types=1);

namespace DistortedFusion\BladeComponents;

/**
 * Renders the `blade-components.tint` configuration as CSS.
 *
 * Emits the `--tint*` custom properties plus the `.bc-surface` utility,
 * consumed through ThemeManager::renderStyles() so the values are part of
 * the stylesheet served by `@ddfsnStyles` — and of its cache-bust hash.
 *
 * @see \DistortedFusion\BladeComponents\ThemeManager::renderStyles()
 */
class SurfaceTint
{
    private const DEFAULT_COLOR = '#5b6cff';

    /**
     * Theme tokens the foreground mode re-tints. Each re-blends from its
     * own unmixed --base-* copy, so light and dark themes tint from their
     * own values and stay legible at the documented strength range.
     */
    private const FOREGROUND_TOKENS = [
        'foreground',
        'muted-foreground',
    ];

    /**
     * @param  array<string, array<string, string>>  $definitions  ThemeManager definitions, keyed by their CSS selector.
     */
    public static function render(array $definitions = []): string
    {
        $color = static::color();
        $strength = static::percent('strength');
        $fade = static::percent('fade');
        $band = max(0, (int) config('blade-components.tint.band', 48));
        $foreground = static::mode() === 'foreground';

        $css = <<<CSS
/* Surface tint (config: blade-components.tint) */
:root {
    --tint:{$color};
    --tint-strength:{$strength}%;
    --tint-fade:{$fade}%;
    --tint-band:{$band}px;
    --tint-hi:color-mix(in oklab, var(--muted), var(--tint) calc(var(--tint-strength) + var(--tint-fade)));
    --tint-lo:color-mix(in oklab, var(--muted), var(--tint) max(calc(var(--tint-strength) - var(--tint-fade)), 0%));
}

CSS;

        if ($foreground) {
            // Inverted: backgrounds stay as themed, the tint moves into the
            // foregrounds. Each theme definition re-tints its own foreground
            // tokens against the unmixed --base-* copies (styles view), so
            // light and dark themes each tint from their own values, and
            // window.DDFSN.setTint() re-blends live via --tint-strength.
            foreach ($definitions as $selector => $variables) {
                $overrides = '';

                foreach (static::FOREGROUND_TOKENS as $token) {
                    if (array_key_exists($token, (array) $variables)) {
                        $overrides .= "    --{$token}:color-mix(in oklab, var(--base-{$token}), var(--tint) var(--tint-strength));\n";
                    }
                }

                if ($overrides !== '') {
                    $css .= "{$selector} {\n{$overrides}}\n\n";
                }
            }

            return $css."/* Foreground mode: .bc-surface stays the plain (untinted) theme surface base. */\n.bc-surface {\n    background-color:var(--muted);\n}\n";
        }

        return $css.<<<'CSS'
/* Solid component surfaces sit on --muted — the theme's lifted base — so
   the stacking hierarchy inverts with the appearance automatically: dark
   themes show near-black canvas under lifted surfaces (dark to light,
   back to front), light themes show white canvas under shaded surfaces
   (light to dark). One flat tint at strength 0, a lifted heading band
   above a plainer body as fade rises (hard-edged double-position stops,
   not a smooth wash). Elements shorter than the band simply take the
   lifted tone as a whole. */
.bc-surface {
    background-color:color-mix(in oklab, var(--muted), var(--tint) var(--tint-strength));
    background-image:linear-gradient(to bottom, var(--tint-hi) 0 var(--tint-band), var(--tint-lo) var(--tint-band) 100%);
}

CSS;
    }

    /**
     * The configured tint mode: "surface" tints solid backgrounds (default),
     * "foreground" keeps backgrounds dark and tints the foreground tokens.
     */
    public static function mode(): string
    {
        return config('blade-components.tint.mode', 'surface') === 'foreground' ? 'foreground' : 'surface';
    }

    /**
     * The configured tint colour, defensively filtered so only harmless CSS
     * value characters reach the stylesheet. Falls back to the default when
     * the configuration holds anything else.
     */
    private static function color(): string
    {
        $color = trim((string) config('blade-components.tint.color', self::DEFAULT_COLOR));

        return preg_match('/^[a-zA-Z0-9#(),.%]{1,64}$/', $color) === 1 ? $color : self::DEFAULT_COLOR;
    }

    private static function percent(string $key): int
    {
        return max(0, min(100, (int) config('blade-components.tint.'.$key, 0)));
    }
}
