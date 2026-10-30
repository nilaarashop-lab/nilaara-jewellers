import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

// Scroll to top when the page changes. Query-only changes are filter/search
// updates (typing in the shop search box, sort, category) — jumping to the top
// on every keystroke would be jarring, so those are left alone.
export function ScrollToTopOnNavigate() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}

// Floating back-to-top button on every page
export function BackToTopButton() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 500);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!show) return null;
  return (
    <button
      className="to-top"
      aria-label="Scroll to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      ↑
    </button>
  );
}
