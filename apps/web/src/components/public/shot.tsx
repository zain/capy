import type { ReactNode } from "react";

// A screenshot inside a browser window frame, so readers can tell which app it came from.
export function Shot({
  src,
  width,
  height,
  alt,
  site,
  size = "wide",
  fade,
  children,
}: {
  src: string;
  width?: number;
  height?: number;
  alt: string;
  site: "claude.ai" | "capyinc.com";
  size?: "wide" | "narrow";
  /** Fades out the bottom edge of a screenshot that is cropped mid-page. */
  fade?: boolean;
  children?: ReactNode;
}) {
  return (
    <figure className={`story-shot ${size}`}>
      <div className={`story-window ${site === "claude.ai" ? "claude" : "capy"}`}>
        <div className="story-window-bar" aria-hidden="true">
          <span className="story-window-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="story-window-url">{site}</span>
        </div>
        <a href={src}>
          <img
            className={fade ? "faded" : undefined}
            src={src}
            width={width}
            height={height}
            alt={alt}
            loading="lazy"
          />
        </a>
      </div>
      {children && <figcaption>{children}</figcaption>}
    </figure>
  );
}
