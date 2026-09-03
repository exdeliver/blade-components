:root.dark {
    color-scheme: dark;
}
@foreach ($definitions as $selector => $variables)
{{ $selector }} {
@foreach ($variables ?? [] as $name => $value)
    --{{ $name }}:{!! $value !!};
    {{-- Unmixed copy of every token, so later rules (the surface tint's
         foreground mode) can color-mix a token against itself without a
         circular custom-property reference. --}}
    --base-{{ $name }}:{!! $value !!};
@endforeach
}
@endforeach
