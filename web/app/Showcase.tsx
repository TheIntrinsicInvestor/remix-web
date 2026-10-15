"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import styles from "./Showcase.module.css";
import StemPlayer from "./StemPlayer";
import Gate from "./Gate";

const FRAME_COUNT = 121;
// The end frame's subject fills ~88% of the frame height, so there is no free corner
// at the usual 0.82-0.90. 0.72 buys headroom; the scrim behind the copy does the rest.
const IMAGE_SCALE = 0.72;
const FRAME_SPEED = 1.5;    // separation completes by ~66% of the scroll container
const framePath = (i: number, mobile: boolean) =>
  `/${mobile ? "frames-mobile" : "frames"}/frame_${String(i + 1).padStart(4, "0")}.webp`;

export default function Showcase() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.registerPlugin(ScrollTrigger);

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const hero = heroRef.current!;
    const scrollContainer = scrollRef.current!;
    const useMobileSet = window.matchMedia("(max-width: 768px)").matches;

    const frames: (HTMLImageElement | undefined)[] = new Array(FRAME_COUNT);
    const loaded: boolean[] = new Array(FRAME_COUNT).fill(false);
    let maxContiguous = -1;   // scrub clamps here so it never lands on a blank frame
    let currentFrame = -1;
    let bgColor = "#0b0f10";
    let cancelled = false;
    let lenis: Lenis | null = null;
    let tickerFn: ((t: number) => void) | null = null;

    function sizeCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      if (currentFrame >= 0) drawFrame(currentFrame);
    }

    function sampleBgColor(img: HTMLImageElement) {
      try {
        const c = document.createElement("canvas");
        c.width = 8;
        c.height = 8;
        const cc = c.getContext("2d")!;
        cc.drawImage(img, 0, 0, 8, 8);
        const d = cc.getImageData(0, 0, 8, 8).data;
        const pts = [0, 7 * 4, 56 * 4, 63 * 4];
        let r = 0, g = 0, b = 0;
        pts.forEach((p) => { r += d[p]; g += d[p + 1]; b += d[p + 2]; });
        return `rgb(${Math.round(r / 4)},${Math.round(g / 4)},${Math.round(b / 4)})`;
      } catch {
        return bgColor;
      }
    }

    function drawFrame(index: number) {
      const img = frames[index];
      if (!img) return;
      const cw = canvas.width, ch = canvas.height;
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const scale = Math.max(cw / iw, ch / ih) * IMAGE_SCALE;
      const dw = iw * scale, dh = ih * scale;
      const dx = (cw - dw) / 2, dy = (ch - dh) / 2;
      if (index % 20 === 0) bgColor = sampleBgColor(img);
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, dx, dy, dw, dh);
    }

    function loadImage(i: number) {
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => { frames[i] = img; loaded[i] = true; resolve(); };
        img.onerror = () => { loaded[i] = true; resolve(); };   // don't stall the contiguous run on one bad file
        img.src = framePath(i, useMobileSet);
      });
    }

    function advanceContiguous() {
      while (maxContiguous + 1 < FRAME_COUNT && loaded[maxContiguous + 1]) maxContiguous++;
    }

    // Poster frame first, then stream the rest in order behind it. No loader screen:
    // the hero paints as soon as frame 1 is decoded and the scrub clamps to what exists.
    async function preload() {
      await loadImage(0);
      if (cancelled) return;
      advanceContiguous();
      drawFrame(0);
      currentFrame = 0;

      const CONCURRENCY = 6;
      let next = 1;
      const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (!cancelled) {
          const i = next++;
          if (i >= FRAME_COUNT) return;
          await loadImage(i);
          advanceContiguous();
        }
      });
      await Promise.all(workers);
    }

    const ctxScope = gsap.context(() => {
      // Frame scrub: storytelling. The separation is the argument, scroll is the transport.
      ScrollTrigger.create({
        trigger: scrollContainer,
        start: "top top",
        end: "bottom bottom",
        scrub: true,
        onUpdate: (self) => {
          const accel = Math.min(self.progress * FRAME_SPEED, 1);
          const wanted = Math.min(Math.floor(accel * (FRAME_COUNT - 1)), FRAME_COUNT - 1);
          const index = Math.min(wanted, Math.max(maxContiguous, 0));
          if (index !== currentFrame) {
            currentFrame = index;
            requestAnimationFrame(() => drawFrame(currentFrame));
          }
        },
      });

      // Sections are positioned by scroll RANGE, not container height, or they drift
      // out of sync with the progress-driven scrub.
      const vh = window.innerHeight;
      const scrollRange = scrollContainer.offsetHeight - vh;
      rootRef.current!.querySelectorAll<HTMLElement>("[data-scroll-section]").forEach((section) => {
        const enter = parseFloat(section.dataset.enter!);
        const leave = parseFloat(section.dataset.leave!);
        const mid = (enter + leave) / 2 / 100;
        section.style.top = mid * scrollRange + vh / 2 + "px";
        if (prefersReduced) {
          gsap.set(section, { opacity: 1 });
          return;
        }
        // Entrance: hierarchy. Brings one beat forward at a time.
        const children = section.querySelectorAll("[data-enter-item]");
        const dx = window.innerWidth < 768 ? 32 : 80;
        const type = section.dataset.animation;
        const base = { opacity: 0, duration: 0.9, ease: "power3.out", stagger: 0.1 } as const;
        const tl = gsap.timeline({ paused: true });
        switch (type) {
          case "slide-left": tl.from(children, { ...base, x: -dx }); break;
          case "slide-right": tl.from(children, { ...base, x: dx }); break;
          case "scale-up": tl.from(children, { ...base, scale: 0.9, ease: "power2.out" }); break;
          // stem labels land one per delamination beat
          case "stagger-up": tl.from(children, { ...base, y: 60, stagger: 0.14 }); break;
          default: tl.from(children, { ...base, y: 50 }); break;
        }
        const persist = section.dataset.persist === "true";
        ScrollTrigger.create({
          trigger: section,
          start: "top 80%",
          end: "bottom 20%",
          animation: tl,
          toggleActions: persist ? "play none none reverse" : "play reverse play reverse",
        });
      });

      // Canvas recedes once the story is told: state transition. The final third is
      // interactive, and interaction should not fight a live scrub.
      const overlay = overlayRef.current!;
      ScrollTrigger.create({
        trigger: scrollContainer,
        start: "top top",
        end: "bottom bottom",
        scrub: true,
        onUpdate: (self) => {
          const p = self.progress;
          const enter = 0.66, full = 0.72;
          let o = 0;
          if (p >= enter && p < full) o = (p - enter) / (full - enter);
          else if (p >= full) o = 1;
          overlay.style.opacity = (o * 0.9).toFixed(3);
        },
      });

      // Hero fades as the scrub takes over: hierarchy. The wordmark goes with it,
      // otherwise sections travelling up collide with it (it is fixed, and there is
      // no nav to keep on screen).
      if (!prefersReduced) {
        ScrollTrigger.create({
          trigger: hero,
          start: "top top",
          end: "bottom top",
          scrub: true,
          onUpdate: (self) => {
            const o = String(Math.max(0, 1 - self.progress * 1.6));
            hero.style.opacity = o;
            if (headerRef.current) headerRef.current.style.opacity = o;
          },
        });
      }
    }, rootRef);

    if (!prefersReduced) {
      lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      });
      lenis.on("scroll", () => ScrollTrigger.update());
      tickerFn = (time: number) => lenis!.raf(time * 1000);
      gsap.ticker.add(tickerFn);
      gsap.ticker.lagSmoothing(0);
    }

    window.addEventListener("resize", sizeCanvas);
    sizeCanvas();
    preload().then(() => {
      if (cancelled) return;
      ScrollTrigger.refresh();
    });

    // React dev double-mounts effects: without this you get duplicate triggers and Lenis instances.
    return () => {
      cancelled = true;
      window.removeEventListener("resize", sizeCanvas);
      if (tickerFn) gsap.ticker.remove(tickerFn);
      lenis?.destroy();
      ctxScope.revert();
    };
  }, []);

  return (
    <div ref={rootRef}>
      {/* Wordmark only. Any link to /studio would be a gate bypass. */}
      <header ref={headerRef} className={styles.header}>
        <span className={styles.wordmark}>Remix</span>
      </header>

      <div className={styles.canvasWrap}>
        <canvas ref={canvasRef} className={styles.canvas} />
      </div>
      <div ref={overlayRef} className={styles.overlay} />

      <section ref={heroRef} className={styles.hero}>
        <div className={styles.heroInner}>
          <h1 className={styles.heroHeading}>Every song is already a mix.</h1>
          <p className={styles.heroTagline}>
            Remix pulls it back apart. Vocals, drums, bass and the rest, as separate files you can sing over.
          </p>
        </div>
      </section>

      <div ref={scrollRef} className={styles.scrollContainer}>
        {/* 2. The premise */}
        <section
          className={`${styles.section} ${styles.topLeft}`}
          data-scroll-section
          data-enter="6"
          data-leave="16"
          data-animation="slide-left"
        >
          <div className={styles.inner}>
            <h2 className={styles.heading} data-enter-item>You get one stereo file.</h2>
            <p className={styles.body} data-enter-item>
              The parts are still in there. A model trained on separated music pulls them back out.
            </p>
          </div>
        </section>

        {/* 3. The split. The money beat: labels land as the waveform delaminates. */}
        <section
          className={`${styles.section} ${styles.bottomRight}`}
          data-scroll-section
          data-enter="22"
          data-leave="38"
          data-animation="stagger-up"
        >
          <div className={styles.inner}>
            <h2 className={styles.heading} data-enter-item>It comes apart.</h2>
            <ul className={styles.stemList}>
              <li className={styles.stemItem} data-enter-item>Vocals</li>
              <li className={styles.stemItem} data-enter-item>Drums</li>
              <li className={styles.stemItem} data-enter-item>Bass</li>
              <li className={styles.stemItem} data-enter-item>Other</li>
            </ul>
            <p className={styles.body} data-enter-item>
              Six stems if you want guitar and piano separated too.
            </p>
          </div>
        </section>

        {/* 4. What comes out */}
        <section
          className={`${styles.section} ${styles.topRight}`}
          data-scroll-section
          data-enter="44"
          data-leave="54"
          data-animation="slide-right"
        >
          <div className={styles.inner}>
            <h2 className={styles.heading} data-enter-item>Take what you need.</h2>
            <p className={styles.body} data-enter-item>
              A backing track to sing over. The vocals alone. All four stems. Or the whole song, moved to a
              key you can actually reach.
            </p>
          </div>
        </section>

        {/* 5. Key and tempo. Last scrub beat. */}
        <section
          className={`${styles.section} ${styles.bottomCenter}`}
          data-scroll-section
          data-enter="58"
          data-leave="65"
          data-animation="fade-up"
        >
          <div className={styles.innerWide}>
            <h2 className={styles.headingWide} data-enter-item>Up or down twelve semitones.</h2>
            <p className={styles.body} data-enter-item>Key and tempo are detected on the way in.</p>
          </div>
        </section>

        {/* 6. The demo. Demonstrates what the scrub only depicts. */}
        <section
          className={`${styles.section} ${styles.center}`}
          data-scroll-section
          data-enter="71"
          data-leave="79"
          data-animation="fade-up"
          data-persist="true"
        >
          <div className={styles.innerCenter}>
            <h2 className={styles.heading} data-enter-item>Fifteen seconds, separated.</h2>
            <div data-enter-item>
              <StemPlayer />
            </div>
          </div>
        </section>

        {/* 7. The writeup. The recruiter's exit, deliberately the plainest thing here. */}
        <section
          className={`${styles.section} ${styles.center}`}
          data-scroll-section
          data-enter="83"
          data-leave="90"
          data-animation="fade-up"
          data-persist="true"
        >
          <div className={styles.innerCenter}>
            <h2 className={styles.heading} data-enter-item>How it is built.</h2>
            <div className={styles.chunks}>
              <div className={styles.chunk} data-enter-item>
                <h3 className={styles.chunkTitle}>Separation</h3>
                <p className={styles.chunkBody}>
                  <span className={styles.mono}>htdemucs_6s</span> by default, <span className={styles.mono}>htdemucs</span>{" "}
                  for four stems. CPU only, at roughly 0.6x the length of the song.
                </p>
              </div>
              <div className={styles.chunk} data-enter-item>
                <h3 className={styles.chunkTitle}>Architecture</h3>
                <p className={styles.chunkBody}>
                  Separate once, cache the stems, then iterate on effects and pitch without separating again.
                  Pitch shifting via Signalsmith, effects via <span className={styles.mono}>pedalboard</span>, analysis
                  via <span className={styles.mono}>librosa</span>.
                </p>
              </div>
              <div className={styles.chunk} data-enter-item>
                <h3 className={styles.chunkTitle}>Deploy</h3>
                <p className={styles.chunkBody}>
                  A FastAPI backend on a Netcup box behind a Cloudflare tunnel. This front end is Next.js on
                  Vercel. Sources come from YouTube, Spotify resolved to a YouTube match, or a direct upload.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 8. The gate. */}
        <section
          className={`${styles.section} ${styles.center}`}
          data-scroll-section
          data-enter="94"
          data-leave="100"
          data-animation="scale-up"
          data-persist="true"
        >
          <div className={styles.innerCenter}>
            <Gate />
          </div>
        </section>
      </div>
    </div>
  );
}
