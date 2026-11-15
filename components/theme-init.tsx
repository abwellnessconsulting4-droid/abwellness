/**
 * Local copy of Once UI's <ThemeInit> (v1.8.2). The published build has a
 * stray `ThemeInit.displayName = ...` statement inside the inline script, so
 * the script throws ReferenceError on every page ("Failed to initialize
 * theme") and silently falls back to dark. Same behavior, minus that line.
 * Remove this file once Once UI ships a fix.
 */
export function ThemeInit({ config }: { config: Record<string, string> }) {
  const json = JSON.stringify(config).replace(/</g, "\\u003c"); // safe inside <script>
  return (
    <script
      id="theme-init"
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var root=document.documentElement;var config=${json};
Object.entries(config).forEach(function(e){root.setAttribute("data-"+e[0],e[1]);});
var resolve=function(v){if(!v||v==="system"){return window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}return v;};
var saved=localStorage.getItem("data-theme");root.setAttribute("data-theme",resolve(saved!=null?saved:config.theme));
Object.keys(config).forEach(function(k){var v=localStorage.getItem("data-"+k);if(v){root.setAttribute("data-"+k,v);}});
}catch(e){console.error("Failed to initialize theme:",e);document.documentElement.setAttribute("data-theme","dark");}})();`,
      }}
    />
  );
}
