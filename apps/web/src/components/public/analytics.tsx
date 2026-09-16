import { useEffect, useRef } from "react";

type PostHog = { capture: (event: string) => void; get_distinct_id: () => string };
declare global {
  interface Window {
    posthog?: PostHog;
  }
}
const bootstrap =
  '\n  !function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}p||((p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",p.onerror=function(){p=null},(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r));var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],Object.defineProperty(u,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e}}),Object.defineProperty(u.people,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(){return u.toString(1)+".people (stub)"}}),o="du vu fu pu yu init Bu Hu Nu qu Vu Kl ju Zu Ou th eh ih nh sh rh capture getExtension zu hu uh calculateEventProperties ah register register_once register_for_session unregister unregister_for_session ph Lu hh getFeatureFlag getFeatureFlagPayload getFeatureFlagResult getAllFeatureFlags isFeatureEnabled reloadFeatureFlags updateFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey displaySurvey cancelPendingSurvey canRenderSurvey canRenderSurveyAsync gh identify setPersonProperties unsetPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset mh shutdown setIdentity clearIdentity get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException addExceptionStep captureLog startExceptionAutocapture stopExceptionAutocapture loadToolbar get_property getSessionProperty dh Ku createPersonProfile setInternalOrTestUser fh bu opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing Qu debug Xl Os getPageViewId captureTraceFeedback captureTraceMetric Pu".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);\n  posthog.init("phc_sx8YqfMiJF8ouePv9sTwfRRpLW8HiH9MEwBdbaVhNWrh", { api_host: "https://g.eureka.md", ui_host: "https://us.posthog.com", defaults: "2026-05-30", person_profiles: "identified_only", autocapture: false, capture_pageleave: true, disable_session_recording: true });\n';

export function PublicAnalytics({ event }: { event?: string }) {
  const tracked = useRef<string | null>(null);
  useEffect(() => {
    // Forks and local installations never send analytics to Capy's hosted project.
    if (window.location.hostname !== "capyinc.com") return;
    const key = event || "$pageview";
    if (tracked.current === key) return;
    tracked.current = key;
    if (window.posthog) window.posthog.capture("$pageview");
    else {
      const script = document.createElement("script");
      script.textContent = bootstrap;
      document.head.appendChild(script);
      script.remove();
    }
    if (event) window.posthog?.capture(event);
  }, [event]);
  return null;
}
