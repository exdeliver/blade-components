---
title: Theming
description: Using CSS Variables and theme classes for styling.
links:
    ddfsn/blade-component-themes: https://github.com/distortedfusion/blade-component-themes
---

Blade Components uses CSS variables for styling. CSS variable definitions are defined in a theme class.

## Convention

Blade Components uses a simple `background` and `foreground` convention for colors. The `background` suffix is omitted when the variable is used for the background color of a component.

Using this convention for the `primary` color this would result in the following CSS variables:

```html
<style>
    :root {
        --primary: oklch(0 0 0);
        --primary-foreground: oklch(1 0 0);
    }
</style>

<div class="bg-[var(--primary)] text-[var(--primary-foreground)]">
    ...
</div>
```

## Available variables

All components use a fixed set of variables. These variables are defined in a PHP enum and together with the [theme class](#themes) processed during runtime.

```php
<?php

namespace DistortedFusion\BladeComponents\Enums;

enum ThemeVariable: string
{
    case BACKGROUND = 'background';
    case FOREGROUND = 'foreground';

    case PRIMARY = 'primary';
    case PRIMARY_FOREGROUND = 'primary-foreground';

    // ...
}
```

For a complete list refer to the [ThemeVariable.php](https://github.com/distortedfusion/blade-components/blob/master/src/Enums/ThemeVariable.php) enum.

## Themes

Themes are defined in [theme classes](https://github.com/distortedfusion/blade-components/tree/master/src/Contracts/ThemeContract.php), which contain a collection of CSS variables, most commonly, for 2 theme variants, light and dark.

Out of the box Blade Components loads the ["default theme"](https://github.com/distortedfusion/blade-components/blob/master/src/Themes/DefaultTheme.php) automatically. The default theme contains a variety of common CSS variable definitions used by Blade Components, including 2 theme variants, light and dark.

During runtime the theme variants will be rendered, by the `@ddfsnStyles` directive, within 2 generic CSS selectors `:root {}` and `.dark {}`.

```css
:root {
    --background: oklch(1 0 0);
    --foreground: oklch(0 0 0);
    ...
}
.dark {
    --background: oklch(0 0 0);
    --foreground: oklch(1 0 0);
    ...
}
```

### Custom theme

When creating a custom theme for Blade Components you're not required to define all possible CSS variables manually. Instead you can simply refer to the default theme and alter the variables you want customized.

```php
<?php

namespace App\Themes;

use DistortedFusion\BladeComponents\Contracts\ThemeContract;
use DistortedFusion\BladeComponents\Themes\DefaultTheme;
use DistortedFusion\BladeComponents\Enums\ThemeVariable;
use DistortedFusion\BladeComponents\Enums\ThemeVariant;

class CustomTheme implements ThemeContract
{
    public static function definitions(ThemeVariant $variant): array
    {
        return match ($variant) {
            ThemeVariant::DARK => static::darkColors(),
            ThemeVariant::LIGHT => static::lightColors(),
            default => [],
        };
    }

    private static function lightColors(): array
    {
        return [
            ...DefaultTheme::definitions(ThemeVariant::LIGHT),

            ThemeVariable::BACKGROUND->value => 'oklch(1 0 0)', // white
            ThemeVariable::FOREGROUND->value => 'oklch(20.5% 0 0)', // neutral-900
        ];
    }

    private static function darkColors(): array
    {
        return [
            ...DefaultTheme::definitions(ThemeVariant::DARK),

            ThemeVariable::BACKGROUND->value => 'oklch(0 0 0)', // black
            ThemeVariable::FOREGROUND->value => 'oklch(97% 0 0)', // neutral-100
        ];
    }
}
```

### Setting the default theme

After creating your custom theme, or when using one of the provided [color variants](https://github.com/distortedfusion/blade-component-themes/tree/master/src), you need to register the default theme in your `AppServiceProvider` using the `BladeComponents::setDefaultTheme()` method.

```php
<?php

namespace App\Providers;

use App\Themes\CustomTheme;
use DistortedFusion\BladeComponents\BladeComponents;
use Illuminate\Support\ServiceProvider;
use Illuminate\View\Compilers\BladeCompiler;

class AppServiceProvider extends ServiceProvider
{
    public function boot()
    {
        if (! $this->app->runningInConsole()) {
            $this->callAfterResolving(BladeCompiler::class, function () {
                BladeComponents::setDefaultTheme(CustomTheme::class);
            });
        }
    }
}
```

### Adding a theme using a custom selector

If you're planning on supporting multiple themes at once, themes should be added using a custom selector. When using a custom selector all registered themes are available simultaneously and won't require a complete page reload when switching between themes.

> [!NOTE]
> Themes applied through custom selectors do not require to implement all available CSS variables and could be used to stack CSS variables across themes.

To register a theme using a custom selector you need to call the `BladeComponents::registerTheme()` method from your `AppServiceProvider`.

```php
<?php

namespace App\Providers;

use App\Themes\CustomTheme as CompanyTheme;
use DistortedFusion\BladeComponents\BladeComponents;
use DistortedFusion\BladeComponents\Enums\ThemeVariant;
use Illuminate\Support\ServiceProvider;
use Illuminate\View\Compilers\BladeCompiler;

class AppServiceProvider extends ServiceProvider
{
    public function boot()
    {
        if (! $this->app->runningInConsole()) {
            $this->callAfterResolving(BladeCompiler::class, function () {
                BladeComponents::registerTheme(
                    theme: CompanyTheme::class,
                    selectorResolver: function (string $theme, ThemeVariant $variant): string {
                        return match ($variant) {
                            ThemeVariant::DARK => '.dark .company-theme',
                            default => ':root .company-theme',
                        };
                    });
            });
        }
    }
}
```

Now you can add the `.company-theme` or both `.dark .company-theme` classes to your document's `<html>` element and your additional theme will be applied.

## Surface tint

Solid component surfaces — panels, cards, menus — can carry a subtle tint of a single accent colour, configured in `config/blade-components.php`:

```php
'tint' => [
    'color' => '#5b6cff',   // hex colour mixed into the theme
    'mode' => 'surface',    // 'surface' tints backgrounds, 'foreground' tints text
    'strength' => 0,        // 0-24, percentage of tint
    'fade' => 0,            // 0-16, extra tint in the top heading band
    'band' => 48,           // heading band height in pixels
],
```

The configuration renders `--tint*` CSS custom properties plus a `.bc-surface` utility into the stylesheet served by `@ddfsnStyles`. Apply the utility to any solid element:

```html
<div class="bc-surface rounded-lg border border-[var(--border)]">
    <div class="border-b border-[var(--border)] p-4">Panel heading</div>
    <div class="p-4">Panel body</div>
</div>
```

Because the tint is mixed into the active theme's `--muted` — the lifted surface base — surfaces always read as sitting *on top of* the `--background` canvas, and the hierarchy inverts with the appearance automatically: dark themes show near-black canvas under lifted, tinted surfaces (dark to light, back to front), light themes show white canvas under shaded, tinted surfaces (light to dark). With `fade` above zero each surface shows a discrete lighter heading band over a plainer body — the classic "card with header" two-tone — while surfaces shorter than the band simply take the lifted tone as a whole.

### Inverted tint

Prefer dark, exactly-as-themed backgrounds with the colour living in the type instead? Set `'mode' => 'foreground'`: `.bc-surface` stays the plain theme background, and each theme's `--foreground` and `--muted-foreground` tokens are re-blended with the tint — every `text-[var(--foreground)]` in your app picks up the hue with no markup changes. Both themes tint from their own values (the stylesheet ships unmixed `--base-*` copies of every token), and `window.DDFSN.setTint()` still drives the blend live through `--tint-strength`. `fade` and `band` only affect surface mode.

End users can override the installed defaults per browser at runtime:

```js
window.DDFSN.setTint({ color: '#e0483e', strength: 12, fade: 8 })

window.DDFSN.setTint(null) // back to the configured defaults
```

The override is persisted in localStorage (`ddfsn.tint`) and restored before first paint by the `@ddfsnAppearance` script, so a reload never flashes the untinted surfaces.

## WebGL surface effects

The tint can also be rendered as a live WebGL glow: instead of the static gradient, tagged elements get a canvas behind their content painted by a coherent ambient light rig — a few slow drifting light blobs, a soft bleed of light along the edges and a pointer light, all sharing one distance falloff so the surface reads as genuinely lit rather than animated. Surfaces also light each other: nearby tagged siblings (a neighbour card, an open dialog) are fed to the shader as occluders, so every light casts their silhouettes as shadows through the surface — sharp-edged for close neighbours, softer as the occluder drifts away from the light. The pointer dragging across a board literally drags its neighbours' shadows with it. Controls light back, one at a time: the single interactable element the light is falling on hardest (buttons, links, inputs, tabs — anything focusable, plus anything tagged data-bc-caster; the hovered control always wins) throws one big hard-edged shadow. The pointer is the light for it: rays grazing the control's corners bound a wedge that starts at the control and runs far across the surface, flaring open with distance, so hovering a button sweeps a long cutting shadow away from the mouse — resting on a key light at the right edge when the mouse is elsewhere. Its darkness scales with how strongly the light is on the control, so it fades in as a blob drifts across and snaps onto whatever the pointer touches. The light paints the element’s own surface colour (its background lifted toward light), blended toward the theme tint only as far as the tint strength asks: at 0% strength the effect is a neutral shimmer in the surface’s own colour, never an overlay of a different one. Enable it in `config/blade-components.php`:

```php
'webgl' => [
    'enabled' => true,
    'components' => [        // per-component on/off; unlisted keys count as enabled
        'card' => true,
        'header' => true,
        'sidebar' => true,
    ],
    'intensity' => 1.0,      // glow opacity scale, on top of the tint strength
    'max_dpr' => 1.5,        // render-resolution cap
],
```

Elements opt in by tagging themselves with a component key — the package's `card`, `header` and `sidebar` components already do:

```html
<div data-bc-webgl="card" class="bc-surface rounded-lg">...</div>
```

The glow re-reads the live `--tint`/`--tint-strength` values, so `window.DDFSN.setTint()` moves it with the CSS tint. While a canvas renders, the static gradient steps aside (`.bc-webgl-active`); everything else about the surface — background colour, borders, rounding — is untouched.

Degradation is silent and total: no WebGL context, an element scrolled out of view, a hidden tab or `prefers-reduced-motion` (which paints a single static frame) all leave the plain CSS tint standing, pixel-identical to the effect at rest. The renderer is one shared animation loop that parks itself when nothing visible needs a new frame; canvases are capped at `max_dpr` and released with their element.
