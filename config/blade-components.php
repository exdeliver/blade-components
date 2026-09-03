<?php

declare(strict_types=1);

use DistortedFusion\BladeComponents\Components;

return [
    /*
    |--------------------------------------------------------------------------
    | Component prefix
    |--------------------------------------------------------------------------
    |
    | A prefix that should be applied to all registered components. This can
    | be used to prevent collisions between identically named components.
    |
    | Example with a prefix of `df`:
    | - Without: <x-btn></x-btn>
    | - With:    <x-df-btn></x-df-btn>
    |
    | @see https://blade-components.com/docs/configuration#preventing-collisions
    |
    */

    'prefix' => null,

    /*
    |--------------------------------------------------------------------------
    | JavaScript variant
    |--------------------------------------------------------------------------
    |
    | Blade Components ships a vanilla JavaScript layer (custom elements
    | powered by Alpine.js) by default. Applications built on Vue 3 may opt
    | into the Vue variant, which implements the same behaviour without
    | Alpine.js.
    |
    | Supported: "blade", "vue"
    |
    */

    'javascript' => env('BLADE_COMPONENTS_JAVASCRIPT', 'blade'),

    /*
    |--------------------------------------------------------------------------
    | Components
    |--------------------------------------------------------------------------
    |
    | All components, including their backing class, that should be
    | registered during runtime.
    |
    | @see https://blade-components.com/docs/configuration#publishing-configuration
    |
    */

    'components' => [
        // Accordion...
        'accordion' => 'blade-components::components.accordion.index',
        'accordion-item' => 'blade-components::components.accordion.item',
        'accordion-content' => 'blade-components::components.accordion.content',
        'accordion-toggle' => Components\Accordion\Toggle::class,
        'accordion-title' => 'blade-components::components.accordion.title',

        // Alert...
        'alert' => Components\Alert\Index::class,

        // Avatar...
        'avatar-stack' => 'blade-components::components.avatar.stack',
        'avatar' => Components\Avatar\Index::class,

        // Button...
        'btn-group' => 'blade-components::components.btn.group',
        'btn' => 'blade-components::components.btn.index',

        // Badge...
        'badge' => 'blade-components::components.badge.index',

        // Breadcrumb...
        'breadcrumb' => 'blade-components::components.breadcrumb.index',
        'breadcrumb-item' => 'blade-components::components.breadcrumb.item',
        'breadcrumb-ellipsis' => 'blade-components::components.breadcrumb.ellipsis',
        'breadcrumb-separator' => 'blade-components::components.breadcrumb.separator',

        // Card...
        'card' => 'blade-components::components.card.index',
        'card-header' => 'blade-components::components.card.header',
        'card-body' => 'blade-components::components.card.body',
        'card-footer' => 'blade-components::components.card.footer',
        'card-title' => 'blade-components::components.card.title',

        // Container...
        'container' => 'blade-components::components.layout.container',

        // Empty...
        'empty' => 'blade-components::components.empty.index',

        // Progress Bar...
        'progress-bar' => 'blade-components::components.progress-bar.index',

        // Separator...
        'separator' => 'blade-components::components.separator.index',

        // Stack...
        'stack' => 'blade-components::components.stack.index',

        // Table...
        'table' => 'blade-components::components.table.index',
        'table-header' => 'blade-components::components.table.header',
        'table-head' => 'blade-components::components.table.head',
        'table-body' => 'blade-components::components.table.body',
        'table-row' => 'blade-components::components.table.row',
        'table-cell' => 'blade-components::components.table.cell',
        'table-caption' => 'blade-components::components.table.caption',

        // KBD...
        'kbd-group' => 'blade-components::components.kbd.group',
        'kbd' => 'blade-components::components.kbd.index',

        // Loading indicators...
        'pulser' => 'blade-components::components.pulser.index',
        'spinner' => 'blade-components::components.spinner.index',
        'three-dot' => 'blade-components::components.three-dot.index',

        // Layout components...
        'footer' => 'blade-components::components.layout.footer',
        'header' => 'blade-components::components.layout.header',
        'main' => 'blade-components::components.layout.main',
        'sidebar' => 'blade-components::components.layout.sidebar',
        'sidebar-toggle' => Components\Layout\SidebarToggle::class,
        'sidebar-backdrop' => 'blade-components::components.layout.sidebar-backdrop',

        'layout-icon' => 'blade-components::components.layout.icon',

        // List group...
        'list-group' => 'blade-components::components.list-group.index',
        'list-group-item' => Components\ListGroup\Item::class,

        // List group - pre-composed elements...
        'list-group.precomposed.title' => 'blade-components::components.list-group.precomposed.title',

        // Typography...
        'currency' => Components\Text\Currency::class,
        'date-time' => Components\Text\DateTime::class,
        'description' => 'blade-components::components.text.description',
        'heading' => Components\Text\Heading::class,
        'number' => Components\Text\Number::class,
        'ol' => 'blade-components::components.text.ol',
        'paragraph' => 'blade-components::components.text.paragraph',
        'pre' => 'blade-components::components.text.pre',
        'ul' => 'blade-components::components.text.ul',

        //
        // Deprecated aliases...
        //

        // Accordion...
        'accordion.item' => 'blade-components::components.accordion.item',
        'accordion.content' => 'blade-components::components.accordion.content',
        'accordion.toggle' => Components\Accordion\Toggle::class,
        'accordion.title' => 'blade-components::components.accordion.title',

        // Avatar...
        'avatar.stack' => 'blade-components::components.avatar.stack',

        // Button...
        'btn.group' => 'blade-components::components.btn.group',

        // Breadcrumb...
        'breadcrumb.item' => 'blade-components::components.breadcrumb.item',
        'breadcrumb.ellipsis' => 'blade-components::components.breadcrumb.ellipsis',
        'breadcrumb.separator' => 'blade-components::components.breadcrumb.separator',

        // Card...
        'card.body' => 'blade-components::components.card.body',
        'card.footer' => 'blade-components::components.card.footer',
        'card.header' => 'blade-components::components.card.header',
        'card.title' => 'blade-components::components.card.title',

        // Layout...
        'layout.icon' => 'blade-components::components.layout.icon',

        // List group - use list-group-item instead...
        'list-group.item' => Components\ListGroup\Item::class,
        'list-group.item-btn' => Components\ListGroup\ItemBtn::class,
        'list-group.item-button' => Components\ListGroup\ItemBtn::class,
        'list-group.item-link' => Components\ListGroup\Item::class,
    ],

    /*
    |--------------------------------------------------------------------------
    | Surface tint
    |--------------------------------------------------------------------------
    |
    | Tint applied to solid component surfaces through the `.bc-surface`
    | utility. A single colour is mixed into the active theme's
    | `--muted` — the theme's lifted surface base: dark themes put it
    | above `--background`, light themes below, so surfaces always read
    | as sitting on top of the canvas (dark→light back-to-front in dark,
    | light→dark in light). The top of each surface is lifted into a
    | discrete lighter heading band, producing the classic "card with
    | header" two-tone.
    |
    | The values are rendered as `--tint*` CSS custom properties and the
    | `.bc-surface` class through the stylesheet served by `@ddfsnStyles`,
    | automatically included in its cache-bust hash. Browsers may override
    | them at runtime via `window.DDFSN.setTint({ color, strength, fade })`
    | — persisted in localStorage (`ddfsn.tint`) and restored pre-paint by
    | the `@ddfsnAppearance` script.
    |
    | color:     Hex colour mixed into the theme's surface base. Keep it
    |            hex; the documented runtime picker only understands
    |            #RRGGBB.
    | mode:      "surface" (default) — tints solid backgrounds like above.
    |            "foreground" — inverted: backgrounds stay exactly as
    |            themed and the tint moves into the foreground tokens
    |            (text picks up a hue of the tint, blended live via
    |            strength). "fade"/"band" only affect surface mode.
    | strength:  0-24 — percentage of tint mixed into solid surfaces.
    | fade:      0-16 — extra tint in the top heading band of each surface
    |            (hard-edged). 0 = uniform tint; higher = more pronounced
    |            stepped "lifted card header" two-tone.
    | band:      Height in pixels of the heading band.
    |
    */

    'tint' => [
        'color' => env('BLADE_COMPONENTS_TINT_COLOR', '#5b6cff'),
        'mode' => env('BLADE_COMPONENTS_TINT_MODE', 'surface'),
        'strength' => (int) env('BLADE_COMPONENTS_TINT_STRENGTH', 0),
        'fade' => (int) env('BLADE_COMPONENTS_TINT_FADE', 0),
        'band' => (int) env('BLADE_COMPONENTS_TINT_BAND', 48),
    ],
];
