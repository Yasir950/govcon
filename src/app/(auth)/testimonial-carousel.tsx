"use client";

import { useEffect, useState } from "react";
import { VerifiedBadge } from "@/components/verified-badge";
import type { Testimonial } from "@/lib/landing-data";

/**
 * Same rotating-testimonial pattern as crewupapp's (auth)/layout.tsx —
 * fades between quotes on a timer and shows dot indicators to jump
 * directly to one. Real testimonials (fetched server-side in layout.tsx
 * via getTestimonials()) instead of crewup's hardcoded array, so this
 * always reflects however many rows exist in the database.
 */
export function TestimonialCarousel({ testimonials }: { testimonials: Testimonial[] }) {
  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (testimonials.length < 2) return;
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setCurrent((c) => (c + 1) % testimonials.length);
        setVisible(true);
      }, 500);
    }, 7000);
    return () => clearInterval(interval);
  }, [testimonials.length]);

  if (testimonials.length === 0) return null;

  const t = testimonials[current];

  function goTo(i: number) {
    setVisible(false);
    setTimeout(() => {
      setCurrent(i);
      setVisible(true);
    }, 500);
  }

  return (
    <>
      <div
        className="auth-visual-testimonial"
        style={{ opacity: visible ? 1 : 0, transition: "opacity 0.5s ease-in-out" }}
      >
        <blockquote>&ldquo;{t.quote}&rdquo;</blockquote>
        <div className="auth-visual-testimonial-author">
          <span className="avatar">{t.initials}</span>
          <span>
            <b>{t.name}{t.verified && <VerifiedBadge />}</b>
            <small>{t.role}</small>
          </span>
        </div>
      </div>

      {testimonials.length > 1 && (
        <div className="auth-visual-dots">
          {testimonials.map((item, i) => (
            <button
              key={item.name}
              type="button"
              onClick={() => goTo(i)}
              className={`auth-visual-dot${i === current ? " active" : ""}`}
              aria-label={`Testimonial ${i + 1}`}
            />
          ))}
        </div>
      )}
    </>
  );
}
