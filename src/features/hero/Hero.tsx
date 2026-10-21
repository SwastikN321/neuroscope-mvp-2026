import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useCallback,
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
import { SIGNAL_DURATION_MS } from './neuralActivity';
import { useJourney } from './useJourney';
import { SignalPresentation, SignalStill } from './SignalPresentation';
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
        src="/models/cortex-still.png"
        alt="Still view of the anatomical cerebral cortex"
        width="900"
        height="900"
      />
      <span>ANATOMICAL STUDY / STILL VIEW</span>
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
  const [signal, setSignal] = useState(false);
  const handleLoading = useCallback(() => setReady(false), []);
  const handleReady = useCallback(() => setReady(true), []);
  const handleFailure = useCallback(() => setFailed(true), []);
  const journey = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);
  const drag = useRef<TrackPoint | null>(null);
  const input = useRef<SceneInput>({
    pointerX: 0,
    pointerY: 0,
    rotation: [0, 0, 0, 1],
    dragging: false,
    paused: false,
    signal: false,
    scroll: 0,
  });
  const still = reducedMotion || !webGL || failed;
  useJourney(journey, input, still);
  const lowPower =
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency <= 4;

  useEffect(() => {
    input.current.paused = paused;
  }, [paused]);

  useEffect(() => {
    input.current.signal = signal && !still;
    if (!signal) return;
    const timer = window.setTimeout(() => setSignal(false), SIGNAL_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [signal, still]);

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
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', updateVisibility);
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
    if (still || paused || input.current.scroll > 0.18) return;
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
    if (still || input.current.scroll > 0.18) return;
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
    <div
      ref={journey}
      className={`neural-journey ${still ? 'neural-journey--static' : ''}`}
    >
      {!still && <span id="signal" className="signal-anchor" />}
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
        <div data-hero-copy className="hero-overline page-container">
          <span>
            <i />
            EEG EXPLORATION / RESEARCH PREVIEW
          </span>
          <span>A NEW PERSPECTIVE ON NEURAL DATA</span>
        </div>
        <div
          ref={stage}
          className={`neural-stage ${still ? 'neural-stage--still' : ''}`}
          role="group"
          tabIndex={still ? -1 : 0}
          aria-label={
            still
              ? 'Still anatomical brain'
              : 'Anatomical brain. Drag freely or use arrow keys for 360-degree rotation. Home resets the view.'
          }
          aria-describedby="sculpture-caption"
          onPointerMove={move}
          onPointerDown={(event) => {
            if (still || input.current.scroll > 0.18 || event.button !== 0)
              return;
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
            <SceneBoundary onFailure={handleFailure}>
              {!ready && <StillSculpture />}
              <Suspense fallback={null}>
                <NeuralCanvas
                  input={input}
                  quality={mobile || lowPower ? 'compact' : 'full'}
                  running={active && !paused}
                  onLoading={handleLoading}
                  onReady={handleReady}
                  onFailure={handleFailure}
                />
              </Suspense>
            </SceneBoundary>
          )}
        </div>
        <div data-hero-copy className="cinematic-title page-container">
          <h1 id="hero-heading">
            See beyond <br />
            <span>
              the signal<span className="hero-stop">.</span>
            </span>
          </h1>
        </div>
        <div data-hero-copy className="cinematic-content page-container">
          <div>
            <p className="hero-positioning">
              Explore real EEG recordings directly in your browser. Visualize
              neural signals, annotate meaningful events, and export your
              findings.
            </p>
            <div className="cinematic-actions">
              <ButtonLink to="/app">
                Try NeuroScope <Icon name="arrow" />
              </ButtonLink>
              <ButtonLink to="/#product" variant="text">
                Explore the platform <Icon name="arrow" />
              </ButtonLink>
            </div>
            {!still && (
              <p className="signal-status" role="status">
                {signal
                  ? 'SIGNAL ACTIVE · TRAVELING THROUGH THE CORTEX'
                  : 'AT REST · AN ARTISTIC STUDY OF NEURAL ACTIVITY'}
              </p>
            )}
          </div>
        </div>
        <div data-hero-copy className="hero-activity">
          {!still && (
            <Button
              variant="secondary"
              className="signal-button"
              aria-pressed={signal}
              onClick={() => {
                setSignal(!signal);
                setPaused(false);
              }}
            >
              <span className="signal-indicator" aria-hidden="true" />
              {signal ? 'Quiet signal' : 'Activate signal'}
            </Button>
          )}
        </div>
        <div data-hero-copy className="sculpture-label" id="sculpture-caption">
          <span className="sculpture-label__line" />
          <div>
            <strong>THE CEREBRAL CORTEX</strong>
            <span>Real anatomy. Imagined electrical pathways.</span>
          </div>
        </div>
        <p data-hero-copy className="anatomy-credit">
          <a href="https://brainder.org/research/brain-for-blender/">
            Brain for Blender · Anderson Winkler
          </a>
          {' / '}
          <a href="/models/ATTRIBUTION.md">Adapted</a>
          {' / '}
          <a href="https://creativecommons.org/licenses/by-sa/3.0/">
            CC BY-SA 3.0
          </a>
        </p>
        {!still && <SignalPresentation />}
        <div className="hero-edge page-container">
          <a data-hero-copy href="#signal">
            <span className="scroll-line" aria-hidden="true" />
            SCROLL INTO THE SIGNAL
          </a>
          <div className="scene-controls">
            {!still && (
              <>
                <span data-hero-copy>
                  DRAG TO EXPLORE / ↑ ↓ ← → / HOME TO RESET
                </span>
                <Button
                  variant="secondary"
                  className="motion-button"
                  aria-label={
                    paused
                      ? 'Resume sculpture motion'
                      : 'Pause sculpture motion'
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
      {still && <SignalStill />}
    </div>
  );
}
