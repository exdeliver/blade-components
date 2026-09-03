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

    public static function render(): string
    {
        $color = static::color();
        $strength = static::percent('strength');
        $fade = static::percent('fade');
        $band = max(0, (int) config('blade-components.tint.band', 48));

        return <<<CSS
/* Surface tint (config: blade-components.tint) */
:root {
    --tint:{$color};
    --tint-strength:{$strength}%;
    --tint-fade:{$fade}%;
    --tint-band:{$band}px;
    --tint-hi:color-mix(in oklab, var(--background), var(--tint) calc(var(--tint-strength) + var(--tint-fade)));
    --tint-lo:color-mix(in oklab, var(--background), var(--tint) max(calc(var(--tint-strength) - var(--tint-fade)), 0%));
}

/* Solid component surfaces: one flat tint at strength 0, a lifted heading
   band above a plainer body as fade rises (hard-edged double-position
   stops, not a smooth wash). Elements shorter than the band simply take
   the lifted tone as a whole. */
.bc-surface {
    background-color:color-mix(in oklab, var(--background), var(--tint) var(--tint-strength));
    background-image:linear-gradient(to bottom, var(--tint-hi) 0 var(--tint-band), var(--tint-lo) var(--tint-band) 100%);
}

CSS;
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
