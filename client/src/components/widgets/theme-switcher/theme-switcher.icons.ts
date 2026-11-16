/* Autor: Marius Middrup (FH Münster) */
/* Icons by Lucide (MIT License) */

import { html } from 'lit';

export const sunMoonIcon = html`<svg
  xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  class="lucide lucide-sun-moon-icon lucide-sun-moon"
>
  <path d="M12 2v2" />
  <path
    d="M14.837 16.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715"
  />
  <path d="M16 12a4 4 0 0 0-4-4" />
  <path d="m19 5-1.256 1.256" />
  <path d="M20 12h2" />
</svg>`;

export const sunIcon = html`<svg
  xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  class="lucide lucide-sun-icon lucide-sun"
>
  <circle cx="12" cy="12" r="4" />
  <path d="M12 2v2" />
  <path d="M12 20v2" />
  <path d="m4.93 4.93 1.41 1.41" />
  <path d="m17.66 17.66 1.41 1.41" />
  <path d="M2 12h2" />
  <path d="M20 12h2" />
  <path d="m6.34 17.66-1.41 1.41" />
  <path d="m19.07 4.93-1.41 1.41" />
</svg>`;

export const moonIcon = html`<svg
  xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  class="lucide lucide-moon-icon lucide-moon"
>
  <path
    d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"
  />
</svg>`;

export const monitorIcon = html`<svg
  xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  class="lucide lucide-monitor-cog-icon lucide-monitor-cog"
>
  <path d="M12 17v4" />
  <path d="m14.305 7.53.923-.382" />
  <path d="m15.228 4.852-.923-.383" />
  <path d="m16.852 3.228-.383-.924" />
  <path d="m16.852 8.772-.383.923" />
  <path d="m19.148 3.228.383-.924" />
  <path d="m19.53 9.696-.382-.924" />
  <path d="m20.772 4.852.924-.383" />
  <path d="m20.772 7.148.924.383" />
  <path d="M22 13v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
  <path d="M8 21h8" />
  <circle cx="18" cy="6" r="3" />
</svg>`;
