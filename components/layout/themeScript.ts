/** Shared by the server layout (inline script) and the client theme provider. */
export const THEME_STORAGE_KEY = 'tf-lab-theme';

/** Runs before first paint: stored choice, else the OS preference, else dark. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`;
