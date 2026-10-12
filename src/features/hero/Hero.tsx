import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent,
  type KeyboardEvent,
} from 'react';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useMediaQuery, webGLAvailable, type SceneInput } from './sceneState';
import './hero.css';
import {
  dragRotation,
  keyboardRotation,
  trackPoint,
  type TrackPoint,
} from './rotation';

const NeuralCanvas = lazy(() => import('./NeuralCanvas'));

function StillSculpture() {
  return (
    <div className="neural-still">
      <img
        src="/neural-still.svg"
        alt="Still artwork of the folded neural sculpture"
        width="800"
        height="640"
      />
      <span>STILL VIEW / NEURAL SCULPTURE</span>
    </div>
  );
}

class SceneBoundary extends Component<
  { children: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? <StillSculpture /> : this.props.children;
  }
}

export function Hero() {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const mobile = useMediaQuery('(max-width: 780px)');
  const [webGL] = useState(webGLAvailable);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(true);
  const [paused, setPaused] = useState(false);
  const [activity, setActivity] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);
  const drag = useRef<TrackPoint | null>(null);
  const input = useRef<SceneInput>({
    pointerX: 0,
    pointerY: 0,
    scroll: 0,
    rotation: [0, 0, 0, 1],
    dragging: false,
    activity: false,
    paused: false,
  });
  const still = reducedMotion || !webGL || failed;
  const lowPower =
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency <= 4;

  useEffect(() => {
    input.current.activity = activity;
    input.current.paused = paused;
  }, [activity, paused]);

  useEffect(() => {
    const target = section.current;
    if (!target) return;
    let visible = true;
    function updateVisibility() {
      setActive(visible && !document.hidden);
    }
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            ([entry]) => {
              visible = entry?.isIntersecting ?? false;
              updateVisibility();
            },
            { threshold: 0.05 },
          );
    observer?.observe(target);
    function updateScroll() {
      const rect = target!.getBoundingClientRect();
      input.current.scroll = Math.max(0, Math.min(1, -rect.top / rect.height));
    }
    document.addEventListener('visibilitychange', updateVisibility);
    window.addEventListener('scroll', updateScroll, { passive: true });
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', updateVisibility);
      window.removeEventListener('scroll', updateScroll);
    };
  }, []);

  function trackCursor(event: PointerEvent<HTMLElement>) {
    if (still || paused || drag.current || event.pointerType === 'touch')
      return;
    const rect = event.currentTarget.getBoundingClientRect();
    input.current.pointerX =
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    input.current.pointerY =
      ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (still || paused) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (drag.current) {
      const size = Math.max(1, Math.min(rect.width, rect.height) * 0.6);
      const point = trackPoint(
        (event.clientX - rect.left - rect.width / 2) / size,
        (rect.top + rect.height / 2 - event.clientY) / size,
      );
      input.current.rotation = dragRotation(
        drag.current,
        point,
        input.current.rotation,
      );
      drag.current = point;
    }
  }
  function release(event: PointerEvent<HTMLDivElement>) {
    drag.current = null;
    input.current.dragging = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function rotateWithKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (still) return;
    if (
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
      event.preventDefault();
      setPaused(false);
      const x =
        event.key === 'ArrowUp' ? -0.05 : event.key === 'ArrowDown' ? 0.05 : 0;
      const y =
        event.key === 'ArrowLeft'
          ? -0.08
          : event.key === 'ArrowRight'
            ? 0.08
            : 0;
      input.current.rotation = keyboardRotation(input.current.rotation, x, y);
    }
    if (event.key === 'Home') {
      input.current.rotation = [0, 0, 0, 1];
      setPaused(false);
    }
  }

  return (
    <section
      ref={section}
      className={`cinematic-hero ${ready || still ? 'cinematic-hero--ready' : ''}`}
      aria-labelledby="hero-heading"
      onPointerMove={trackCursor}
      onPointerLeave={() => {
        if (!drag.current) {
          input.current.pointerX = 0;
          input.current.pointerY = 0;
        }
      }}
    >
      <div className="hero-atmosphere" aria-hidden="true" />
      <div className="hero-overline page-container">
        <span>
          <i />
          NEURAL STUDY — 001
        </span>
        <span>FORM. DEPTH. POSSIBILITY.</span>
      </div>
      <div
        ref={stage}
        className={`neural-stage ${still ? 'neural-stage--still' : ''}`}
        role="group"
        tabIndex={still ? -1 : 0}
        aria-label={
          still
            ? 'Still neural sculpture'
            : 'Neural sculpture. Drag freely or use arrow keys for 360-degree rotation. Home resets the view.'
        }
        aria-describedby="sculpture-caption"
        onPointerMove={move}
        onPointerDown={(event) => {
          if (still || event.button !== 0) return;
          setPaused(false);
          const rect = event.currentTarget.getBoundingClientRect();
          const size = Math.max(1, Math.min(rect.width, rect.height) * 0.6);
          drag.current = trackPoint(
            (event.clientX - rect.left - rect.width / 2) / size,
            (rect.top + rect.height / 2 - event.clientY) / size,
          );
          input.current.dragging = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={() => {
          drag.current = null;
          input.current.dragging = false;
        }}
        onKeyDown={rotateWithKeys}
      >
        {still ? (
          <StillSculpture />
        ) : (
          <SceneBoundary onFailure={() => setFailed(true)}>
            <Suspense fallback={<StillSculpture />}>
              <NeuralCanvas
                input={input}
                quality={mobile || lowPower ? 'compact' : 'full'}
                running={active && !paused}
                onReady={() => setReady(true)}
                onFailure={() => setFailed(true)}
              />
            </Suspense>
          </SceneBoundary>
        )}
      </div>
      <div className="cinematic-title page-container">
        <h1 id="hero-heading">
          See beyond <br />
          <span>
            the signal<span className="hero-stop">.</span>
          </span>
        </h1>
      </div>
      <div className="cinematic-content page-container">
        <div>
          <p>Explore the electrical language of the brain.</p>
          <div className="cinematic-actions">
            <ButtonLink to="/app">
              Explore NeuroScope <Icon name="arrow" />
            </ButtonLink>
            {!still && (
              <Button
                variant="text"
                aria-pressed={activity}
                onClick={() => {
                  setActivity(!activity);
                  setPaused(false);
                }}
              >
                <span className="activity-glyph" aria-hidden="true">
                  ↗
                </span>
                {activity ? 'Signal activated' : 'Activate signal'}
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="sculpture-label" id="sculpture-caption">
        <span className="sculpture-label__line" />
        <div>
          <strong>CORTICAL ASSEMBLY</strong>
          <span>Conceptual neural artwork · synthetic activity</span>
        </div>
      </div>
      <div className="hero-edge page-container">
        <a href="#design-system">
          <span className="scroll-line" aria-hidden="true" />
          SCROLL TO DISCOVER
        </a>
        <div className="scene-controls">
          {!still && (
            <>
              <span>ROTATE 360° / ARROW KEYS / HOME TO RESET</span>
              <Button
                variant="secondary"
                className="motion-button"
                aria-label={
                  paused ? 'Resume sculpture motion' : 'Pause sculpture motion'
                }
                aria-pressed={paused}
                onClick={() => setPaused(!paused)}
              >
                {paused ? (
                  <span aria-hidden="true">▶</span>
                ) : (
                  <span aria-hidden="true">Ⅱ</span>
                )}
              </Button>
            </>
          )}{' '}
          {still && (
            <span>
              {reducedMotion
                ? 'REDUCED MOTION / STILL VIEW'
                : 'WEBGL UNAVAILABLE / STILL VIEW'}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
