// Cyberpunk Pip: the idle mascot plus a neon visor, edge glow and circuit traces. Layered on top of the normal art.
export const PIP_CYBER = `<defs>
<linearGradient id="pc-neon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#19F0FF"/><stop offset=".55" stop-color="#7A5CFF"/><stop offset="1" stop-color="#FF2EC4"/></linearGradient>
<linearGradient id="pc-visor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#171A2B"/><stop offset="1" stop-color="#0B0C16"/></linearGradient>
<clipPath id="pc-clip"><path d="M240 376 Q238 362 254 360 L534 336 Q552 334 552 350 L552 418 Q552 430 538 432 L262 458 Q242 460 240 444 Z"/></clipPath>
<filter id="pc-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<g class="cy">
<path class="cy-edge" d="M132 214 Q140 172 188 168 L338 154 Q418 148 482 164 L536 184 Q582 202 592 252 L610 384 Q618 414 646 420 Q682 430 670 468 Q662 494 636 506 L528 534 Q508 540 502 566 L474 646 Q468 668 440 670 L214 688 Q172 692 162 650 L110 262 Q108 232 132 214 Z" fill="none" stroke="url(#pc-neon)" stroke-width="7" stroke-linejoin="round" filter="url(#pc-glow)" opacity=".95"/>
<g class="cy-trace" fill="none" stroke="#19F0FF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".8"><path d="M196 560 L196 600 L246 620 L330 614"/><path d="M330 614 L330 640 L396 636"/><path d="M540 470 L580 470 L596 450"/><path d="M186 270 L186 300 L214 320"/></g>
<g fill="#FF2EC4" filter="url(#pc-glow)"><circle cx="330" cy="614" r="8"/><circle cx="396" cy="636" r="7"/><circle cx="596" cy="450" r="7"/><circle cx="214" cy="320" r="7"/></g>
<path d="M240 376 Q238 362 254 360 L534 336 Q552 334 552 350 L552 418 Q552 430 538 432 L262 458 Q242 460 240 444 Z" fill="url(#pc-visor)" stroke="url(#pc-neon)" stroke-width="7" stroke-linejoin="round" filter="url(#pc-glow)"/>
<g clip-path="url(#pc-clip)"><rect class="cy-scan" x="230" y="320" width="46" height="160" fill="#fff" opacity=".18" transform="skewX(-14)"/>
<path d="M250 372 L544 346" stroke="#fff" stroke-width="4" opacity=".22" stroke-linecap="round"/></g>
<g class="cy-eyes" filter="url(#pc-glow)"><ellipse class="cy-eye" cx="304" cy="408" rx="22" ry="30" fill="#19F0FF"/><ellipse class="cy-eye" cx="478" cy="392" rx="22" ry="30" fill="#FF2EC4"/></g>
<g class="cy-ant"><path d="M512 96 L560 40" stroke="#7A5CFF" stroke-width="7" stroke-linecap="round"/><circle class="cy-led" cx="562" cy="36" r="12" fill="#FF2EC4" filter="url(#pc-glow)"/></g>
</g>`;
