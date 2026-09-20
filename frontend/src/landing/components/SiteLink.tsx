import type { AnchorHTMLAttributes } from "react";
import { Link } from "react-router-dom";

type SiteLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
};

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;

/**
 * One place that decides how a landing-page link behaves:
 * - `https://…` opens in a new tab (GitHub, docs)
 * - `/login` navigates inside the SPA without a full reload
 * - `#anchor` stays a plain in-page anchor
 */
export function SiteLink({ href, ...rest }: SiteLinkProps) {
  if (EXTERNAL.test(href)) {
    return <a href={href} target="_blank" rel="noopener noreferrer" {...rest} />;
  }
  if (href.startsWith("/")) {
    return <Link to={href} {...rest} />;
  }
  return <a href={href} {...rest} />;
}
