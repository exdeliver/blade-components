<?php

declare(strict_types=1);

namespace DistortedFusion\BladeComponents;

use Closure;
use DistortedFusion\BladeComponents\Contracts\ThemeContract;
use DistortedFusion\BladeComponents\Enums\ThemeVariant;
use DistortedFusion\BladeComponents\Exceptions\InvalidThemeException;
use DistortedFusion\BladeComponents\Themes\DefaultTheme;
use Illuminate\Support\Facades\View;

class ThemeManager
{
    protected static string $defaultTheme = DefaultTheme::class;

    protected static bool $withDefaultTheme = true;

    protected static array $definitions = [];

    /**
     * Register definitions for the provided selector.
     *
     * @param array       $definitions
     * @param string|null $selector
     *
     * @return static
     */
    public static function register(array $definitions, ?string $selector = null): static
    {
        $selector = is_null($selector) ? ':root' : $selector;

        static::$definitions[$selector] = [
            ...isset(static::$definitions[$selector]) ? static::$definitions[$selector] : [],
            ...$definitions,
        ];

        return new static();
    }

    /**
     * Register a theme.
     *
     * @param string   $theme
     * @param ?Closure $selectorResolver
     *
     * @return static
     */
    public static function registerTheme(string $theme, ?Closure $selectorResolver = null): static
    {
        if (! in_array(ThemeContract::class, class_implements($theme))) {
            throw new InvalidThemeException();
        }

        foreach (ThemeVariant::cases() as $variant) {
            $definitions = $theme::definitions(
                variant: $variant
            );

            if (! empty($definitions)) {
                $selector = ! is_null($selectorResolver)
                    ? $selectorResolver(theme: $theme, variant: $variant)
                    : $variant->selector();

                static::register(definitions: $definitions, selector: $selector);
            }
        }

        return new static();
    }

    public static function definitions(): array
    {
        if (static::$withDefaultTheme) {
            static::registerTheme(static::defaultTheme());
        }

        return static::$definitions;
    }

    public static function renderStyles(): string
    {
        // Theme variables first, then the configured surface tint and WebGL
        // effect styles — all
        // flow through here so they share one response and one cache-bust
        // hash (hashStyles() below). The tint receives the definitions so
        // foreground mode can re-tint each theme's own tokens.
        $definitions = static::definitions();

        return View::make('blade-components::styles', [
            'definitions' => $definitions,
        ])->render().SurfaceTint::render($definitions).WebglEffects::render();
    }

    public static function hashStyles(): string
    {
        return hash('xxh128', static::renderStyles());
    }

    /**
     * Get the default theme.
     *
     * @return string|null
     */
    public static function defaultTheme(): ?string
    {
        return static::$withDefaultTheme ? static::$defaultTheme : null;
    }

    /**
     * Set the default theme.
     *
     * @param string $theme
     *
     * @return void
     */
    public static function setDefaultTheme(string $theme): void
    {
        if (! in_array(ThemeContract::class, class_implements($theme))) {
            throw new InvalidThemeException();
        }

        static::$defaultTheme = $theme;
    }

    /**
     * Disable the default theme.
     *
     * @param bool $state
     *
     * @return void
     */
    public static function disableDefaultTheme(bool $state = true)
    {
        static::$withDefaultTheme = ! $state;
    }
}
