/**
 * A visible mouse pointer for recordings. Playwright moves a real cursor, but the browser
 * does not draw one in a captured frame, so this draws one from the mouse events.
 */
export function installCursor() {
  const style = document.createElement("style");
  style.textContent = `
    #precog-cursor {
      position: fixed;
      top: 0;
      left: 0;
      width: 22px;
      height: 22px;
      margin: -11px 0 0 -11px;
      border-radius: 50%;
      border: 2px solid rgba(17, 17, 17, 0.85);
      background: rgba(255, 255, 255, 0.35);
      box-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);
      pointer-events: none;
      z-index: 2147483647;
      transition: width 90ms ease, height 90ms ease, margin 90ms ease, background 90ms ease;
      will-change: transform;
    }
    #precog-cursor::after {
      content: "";
      position: absolute;
      inset: 7px;
      border-radius: 50%;
      background: rgba(17, 17, 17, 0.9);
    }
    #precog-cursor[data-down="true"] {
      width: 15px;
      height: 15px;
      margin: -7.5px 0 0 -7.5px;
      background: rgba(17, 17, 17, 0.2);
    }
    .precog-click-ring {
      /* Positioned with left and top, because the animation owns the transform. */
      position: fixed;
      width: 16px;
      height: 16px;
      margin: -8px 0 0 -8px;
      border-radius: 50%;
      border: 2px solid rgba(17, 17, 17, 0.65);
      pointer-events: none;
      z-index: 2147483646;
      animation: precog-ripple 500ms ease-out forwards;
    }
    @keyframes precog-ripple {
      to { transform: scale(3.2); opacity: 0; }
    }
  `;

  const cursor = document.createElement("div");
  cursor.id = "precog-cursor";
  cursor.dataset.down = "false";
  // Off screen until the pointer is first seen, so it never sits in the top left corner.
  cursor.style.transform = "translate(-100px, -100px)";

  const mount = () => {
    document.documentElement.append(style, cursor);
  };
  if (document.documentElement) mount();
  else addEventListener("DOMContentLoaded", mount, { once: true });

  let x = -100;
  let y = -100;
  addEventListener(
    "mousemove",
    (event) => {
      x = event.clientX;
      y = event.clientY;
      cursor.style.transform = `translate(${x}px, ${y}px)`;
    },
    true,
  );
  addEventListener(
    "mousedown",
    () => {
      cursor.dataset.down = "true";
      const ring = document.createElement("div");
      ring.className = "precog-click-ring";
      ring.style.left = `${x}px`;
      ring.style.top = `${y}px`;
      document.documentElement.append(ring);
      setTimeout(() => ring.remove(), 520);
    },
    true,
  );
  addEventListener(
    "mouseup",
    () => {
      cursor.dataset.down = "false";
    },
    true,
  );
}
