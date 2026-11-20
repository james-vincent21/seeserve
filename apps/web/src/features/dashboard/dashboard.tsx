'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { analyzeFrame, getDemoState, registerStaffVisit, resetDemo, setDemoMode, type DemoSnapshot } from '@/shared/api/client';
import styles from './dashboard.module.css';

const FRAME_INTERVAL_MS = Number(process.env.NEXT_PUBLIC_DEMO_FRAME_INTERVAL_MS ?? 3000);
const MAX_FRAME_WIDTH = 640;

/**
 * Capture a video frame to a base64 JPEG **off the main thread** using
 * `OffscreenCanvas` when the browser supports it, falling back to a regular
 * `<canvas>` otherwise.  This keeps the main thread free so the `<video>`
 * element continues to decode and present frames without stutter.
 */
async function captureFrameBase64(
  video: HTMLVideoElement,
  fallbackCanvas: HTMLCanvasElement,
): Promise<string> {
  const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
  const w = Math.max(1, Math.round(video.videoWidth * scale));
  const h = Math.max(1, Math.round(video.videoHeight * scale));

  let blob: Blob;

  if (typeof OffscreenCanvas !== 'undefined') {
    // --- Fast path: OffscreenCanvas keeps work off the main thread ----------
    const oc = new OffscreenCanvas(w, h);
    const ctx = oc.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not prepare a frame in memory');
    ctx.drawImage(video, 0, 0, w, h);
    blob = await oc.convertToBlob({ type: 'image/jpeg', quality: 0.65 });
  } else {
    // --- Fallback: regular canvas (Safari < 16.4, etc.) ---------------------
    fallbackCanvas.width = w;
    fallbackCanvas.height = h;
    const ctx = fallbackCanvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not prepare a frame in memory');
    ctx.drawImage(video, 0, 0, w, h);
    blob = await new Promise<Blob>((resolve, reject) => {
      fallbackCanvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('Frame encoding failed'))),
        'image/jpeg',
        0.65,
      );
    });
  }

  // Convert to base64 — use arrayBuffer() where available (faster, no FileReader).
  if (typeof blob.arrayBuffer === 'function') {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not encode frame'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(blob);
  });
}

function Icon({ name }: { name: 'grid' | 'video' | 'bell' | 'settings' | 'shield' | 'arrow' | 'play' | 'upload' | 'spark' }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths = {
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></>,
    video: <><rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.6.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.6-.9l-1.7.6-1.4-2.4L7.5 15a8 8 0 0 1 0-1.9L6.1 12l1.4-2.4 1.7.6a8 8 0 0 1 1.6-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.6.9l1.7-.6 1.4 2.4-1.4 1.1a8 8 0 0 1-.1 1.9Z"/></>,
    shield: <><path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/></>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    play: <path d="m9 6 10 6-10 6V6Z" fill="currentColor" stroke="none"/>,
    upload: <><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 14v5h14v-5"/></>,
    spark: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/></>,
  };
  return <svg {...common} aria-hidden="true">{paths[name]}</svg>;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function Dashboard() {
  const [snapshot, setSnapshot] = useState<DemoSnapshot | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoAspectRatio, setVideoAspectRatio] = useState(16 / 9);
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inFlightRef = useRef(false);
  const fileUrlRef = useRef('');

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await getDemoState());
      setError('');
    } catch {
      setError('Cannot reach Express on port 4000. Make sure the API server is running, then retry.');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1500);
    return () => {
      window.clearInterval(timer);
      if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    };
  }, [refresh]);

  const onChooseVideo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    const nextUrl = URL.createObjectURL(file);
    fileUrlRef.current = nextUrl;
    setVideoUrl(nextUrl);
    setError('');
  };

  const processCurrentFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.paused || video.ended || video.readyState < 2 || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const base64 = await captureFrameBase64(video, canvas);
      const sampledAt = video.currentTime;
      const result = await analyzeFrame(base64, sampledAt);
      // Only apply state updates if the video is still playing — the user may
      // have paused or switched clips while the API request was in flight.
      if (!videoRef.current?.paused) {
        setSnapshot(result);
        setLastAnalyzedAt(sampledAt);
        setError('');
      }
    } catch (caught) {
      // Show the error but do NOT pause the video — network hiccups should not
      // interrupt playback.  The next interval will retry automatically.
      setError(caught instanceof Error ? caught.message : 'Frame analysis failed');
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Use a self-scheduling timeout instead of setInterval so the next
    // capture only starts FRAME_INTERVAL_MS after the previous one finishes.
    // This avoids pile-ups when the API is slow and keeps the video smooth.
    let cancelled = false;
    async function loop() {
      if (cancelled) return;
      await processCurrentFrame();
      if (!cancelled) timerId = window.setTimeout(loop, FRAME_INTERVAL_MS);
    }
    let timerId = window.setTimeout(loop, FRAME_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [processCurrentFrame]);

  const startDemo = async () => {
    try {
      setSnapshot(await resetDemo());
      setError('');
      await videoRef.current?.play();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start the demo');
    }
  };

  const staffVisited = async (tableId: string) => {
    try {
      const videoTimeSeconds = videoRef.current?.currentTime ?? 0;
      setSnapshot(await registerStaffVisit(tableId, videoTimeSeconds));
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not record the staff visit');
    }
  };

  const toggleMode = async () => {
    const nextMode = snapshot?.mode === 'iftar' ? 'standard' : 'iftar';
    try {
      setSnapshot(await setDemoMode(nextMode));
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change demo mode');
    }
  };

  const tables = snapshot?.tables ?? [];
  const alerts = snapshot?.alerts ?? [];
  const occupiedCount = tables.reduce((sum, table) => sum + table.seats.filter((seat) => seat.occupied).length, 0);
  const totalSeats = tables.reduce((sum, table) => sum + table.seats.length, 0);
  const engineLabel = snapshot?.inferenceMode === 'ultralytics' ? 'YOLOv8 public model' : 'Preview engine';

  return (
    <div className={styles.appShell}>
      <aside className={styles.sidebar}>
        <a className={styles.brand} href="#overview" aria-label="SeeServe home">
          <span className={styles.brandMark}><span /><span /><span /><span /></span>
          <span className={styles.brandText}>see<span>serve</span><small>FLOOR INTELLIGENCE</small></span>
        </a>

        <div className={styles.sideLabel}>WORKSPACE</div>
        <nav className={styles.navigation} aria-label="Main navigation">
          <a className={`${styles.navItem} ${styles.navActive}`} href="#overview"><Icon name="grid"/><span>Overview</span><i /></a>
          <a className={styles.navItem} href="#video"><Icon name="video"/><span>Demo video</span></a>
          <a className={styles.navItem} href="#seats"><Icon name="grid"/><span>Seat map</span></a>
          <a className={styles.navItem} href="#alerts"><Icon name="bell"/><span>Alerts</span>{alerts.length > 0 && <span className={styles.navAlertBadge}>{alerts.length}</span>}</a>
        </nav>

        <div className={styles.sidebarBottom}>
          <div className={styles.privacyCard}>
            <div className={styles.privacyIcon}><Icon name="shield" /></div>
            <strong>Privacy mode</strong>
            <p>Frames go to Ultralytics for inference; this app does not store them.</p>
            <span><i /> ACTIVE</span>
          </div>
          <div className={styles.profile}>
            <div className={styles.avatar}>S</div>
            <div><strong>SeeServe Demo</strong><small>Local workspace</small></div>
            <button className={styles.iconButton} aria-label="Workspace settings"><Icon name="settings" /></button>
          </div>
        </div>
      </aside>

      <main className={styles.main} id="overview">
        <header className={styles.topbar}>
          <div className={styles.breadcrumb}>WORKSPACE <span>/</span> <strong>OVERVIEW</strong></div>
          <div className={styles.topActions}>
            <button className={styles.modeToggle} onClick={() => void toggleMode()} title="Toggle Standard vs Iftar mode">
              <span>{snapshot?.mode === 'iftar' ? '🌙 IFTAR MODE' : '☀️ STANDARD MODE'}</span>
              <small>{snapshot ? `${snapshot.unattendedSeconds}s unattended threshold${snapshot.mode === 'iftar' ? ' · early alerts suppressed' : ''}` : 'Loading…'}</small>
            </button>
            <span className={styles.connection}><i /> LOCAL SESSION</span>
            <button className={styles.topIcon} aria-label="Notifications"><Icon name="bell" /></button>
            <div className={styles.dateStamp}>DEMO BUILD <span>01</span></div>
          </div>
        </header>

        <div className={styles.content}>
          <section className={styles.intro}>
            <div>
              <div className={styles.kicker}><span /> RESTAURANT OPERATIONS, IN FOCUS</div>
              <h1>A clearer view of<br/><em>every table.</em></h1>
              <p className={styles.introCopy}>A quiet layer of intelligence for the moments that shape great service.</p>
            </div>
            <div className={styles.sessionBadge}><span className={styles.sessionPulse} /><div><strong>Presentation mode</strong><small>Recorded clip · one camera view</small></div><span className={styles.sessionArrow}><Icon name="arrow" /></span></div>
          </section>

          <section className={styles.metrics} aria-label="Session summary">
            <article className={styles.metricCard}><span className={styles.metricLabel}>TABLES IN VIEW</span><div className={styles.metricValue}>{String(tables.length).padStart(2, '0')}<small> configured</small></div><div className={styles.metricFoot}><span className={styles.metricLine} /> Polygon zones</div></article>
            <article className={styles.metricCard}><span className={styles.metricLabel}>OCCUPIED SEATS</span><div className={styles.metricValue}>{String(occupiedCount).padStart(2, '0')}<small> / {String(totalSeats).padStart(2, '0')}</small></div><div className={styles.metricFoot}><span className={styles.statusDot} /> Guest positions detected</div></article>
            <article className={styles.metricCard}><span className={styles.metricLabel}>SEATED TABLES</span><div className={styles.metricValue}>{String(tables.filter((t) => t.status === 'seated').length).padStart(2, '0')}<small> / {String(tables.length).padStart(2, '0')}</small></div><div className={styles.metricFoot}><span className={styles.alertMini}>↗</span> Active service zones</div></article>
            <article className={`${styles.metricCard} ${styles.metricEngine}`}><span className={styles.metricLabel}>VISION ENGINE</span><div className={styles.engineValue}><span className={styles.engineGlyph}><Icon name="spark" /></span><div><strong>{engineLabel}</strong><small>{snapshot?.inferenceMode === 'ultralytics' ? 'Shared inference' : 'Preview only'}</small></div></div><div className={styles.metricFoot}>Frame budget <strong>{snapshot?.analyzedFrames ?? 0} / {snapshot?.maxFrames ?? 100}</strong></div></article>
          </section>

          {error && <div className={styles.errorBanner}><span>!</span><p>{error}</p><button onClick={() => void refresh()}>Retry</button></div>}

          <div className={styles.primaryGrid}>
            <section className={styles.videoCard} id="video">
              <div className={styles.cardHeader}>
                <div><span className={styles.sectionIndex}>01 / INPUT</span><h2>Demo feed</h2></div>
                <span className={styles.localTag}><i /> LOCAL CLIP</span>
              </div>
              <div className={styles.videoStage}>
                {videoUrl ? <div className={styles.videoMedia} style={{ aspectRatio: videoAspectRatio, width: `min(100%, ${videoAspectRatio * 65}vh)` }}>
                  <video
                    ref={videoRef}
                    className={styles.video}
                    src={videoUrl}
                    controls
                    playsInline
                    onLoadedMetadata={(event) => {
                      const source = event.currentTarget;
                      if (source.videoWidth && source.videoHeight) setVideoAspectRatio(source.videoWidth / source.videoHeight);
                    }}
                    onPlay={() => setBusy(true)}
                    onPause={() => setBusy(false)}
                    onEnded={() => setBusy(false)}
                  />
                  <div className={styles.detectionOverlay} aria-live="polite">
                    <svg className={styles.zoneOverlay} viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Table zones numbered from left to right">
                      {tables.map((table, index) => {
                        const centerX = table.zone.reduce((sum, point) => sum + point[0], 0) / table.zone.length;
                        const centerY = table.zone.reduce((sum, point) => sum + point[1], 0) / table.zone.length;
                        const points = table.zone.map(([x, y]) => `${x * 100},${y * 100}`).join(' ');
                        const accent = table.status === 'seated' ? '#f0b16f' : '#d5ff4f';
                        return <g key={table.id}>
                          <polygon points={points} fill={accent} fillOpacity="0.045" stroke={accent} strokeWidth="0.22" strokeDasharray="0.9 0.55" />
                          <g transform={`translate(${centerX * 100} ${centerY * 100})`}>
                            <rect x="-4.5" y="-2.7" width="9" height="5.4" rx="1" fill="#17221e" fillOpacity="0.94" stroke={accent} strokeWidth="0.3" />
                            <text y="0.9" textAnchor="middle" fill={accent} fontSize="2.5" fontWeight="800">T{index + 1}</text>
                          </g>
                        </g>;
                      })}
                    </svg>
                    {(snapshot?.detections ?? []).map((detection, index) => {
                      const table = tables.find((item) => item.id === detection.tableId);
                      const assignment = table && detection.seatId
                        ? `${table.label} · ${detection.seatId.replace('seat-', 'S')}`
                        : 'PERSON · UNASSIGNED';
                      return <div
                        key={`${detection.tableId ?? 'none'}-${detection.seatId ?? 'unassigned'}-${detection.label}-${index}`}
                        className={`${styles.detectionBox} ${detection.label.toLowerCase() === 'chair' || detection.label === '56' ? styles.chairDetectionBox : ''} ${detection.tableId ? '' : styles.unassignedBox}`}
                        style={{
                          left: `${detection.x1 * 100}%`, top: `${detection.y1 * 100}%`,
                          width: `${(detection.x2 - detection.x1) * 100}%`,
                          height: `${(detection.y2 - detection.y1) * 100}%`,
                        }}
                      ><span>{detection.label.toUpperCase()} · {assignment} · {Math.round(detection.confidence * 100)}%</span></div>;
                    })}
                  </div>
                </div> : <div className={styles.emptyStage}>
                  <div className={styles.stageOrb}><span /><span /><span /></div>
                  <p className={styles.stageOverline}>READY FOR INPUT</p>
                  <h3>Bring the floor<br/>into focus.</h3>
                  <p className={styles.stageHint}>Choose a staged restaurant clip to begin your presentation.</p>
                  <button className={styles.stageChoose} onClick={() => document.getElementById('video-file-input')?.click()}><Icon name="upload"/> Select a video <span>MP4 · MOV · WEBM</span></button>
                </div>}
                <canvas ref={canvasRef} className={styles.hiddenCanvas} aria-hidden="true" />
                {videoUrl && <div className={styles.videoOverlay}><span><i /> PLAYBACK UNINTERRUPTED · BOXES FROM {lastAnalyzedAt === null ? '—' : formatDuration(lastAnalyzedAt)}</span><span>{formatDuration(videoRef.current?.currentTime ?? 0)}</span></div>}
              </div>
              <div className={styles.videoFooter}>
                <div className={styles.clipInfo}><div className={styles.clipGlyph}><Icon name="video" /></div><div><strong>{videoUrl ? 'Staged restaurant clip' : 'No video selected'}</strong><small>{videoUrl ? `Sampling every ${FRAME_INTERVAL_MS / 1000} seconds · ${snapshot?.analyzedFrames ?? 0} frames processed` : 'Your source clip stays in this browser'}</small></div></div>
                <input id="video-file-input" className={styles.hiddenInput} type="file" accept="video/*" onChange={onChooseVideo}/>
                <div className={styles.videoButtons}>
                  {videoUrl && <button className={styles.secondaryButton} onClick={() => document.getElementById('video-file-input')?.click()}>Change clip</button>}
                  <button className={styles.playButton} disabled={!videoUrl || busy} onClick={() => void startDemo()}><Icon name="play"/>{busy ? 'Playing' : 'Reset & play'}</button>
                </div>
              </div>
            </section>

            <div className={styles.sideColumn}>
              <section className={styles.seatsCard} id="seats">
                <div className={styles.cardHeader}>
                  <div><span className={styles.sectionIndex}>02 / FLOOR PLAN</span><h2>Table overview</h2></div>
                  <div className={styles.legend}><span><i className={styles.legendVacant}/> VACANT</span><span><i className={styles.legendSeated}/> SEATED</span><span><i className={styles.legendOther}/> OTHER</span></div>
                </div>
                {tables.length ? <div className={styles.seatsList}>{tables.map((table, index) => <article className={`${styles.seatTile} ${styles[`tile_${table.status}`]}`} key={table.id}>
                  <div className={styles.tableTileTop}><span className={styles.tableNumber}>T{String(index + 1).padStart(2, '0')}</span><span className={styles.tableState}><i />{table.status}</span></div>
                  <div className={styles.tableTileBottom}>
                    <div>
                      <strong>{table.label}</strong>
                      <small>{table.seats.length} chairs · {table.seats.filter((seat) => seat.occupied).length} occupied</small>
                      <div className={styles.seatIndicators} aria-label={`${table.seats.filter((seat) => seat.occupied).length} of ${table.seats.length} seats occupied`}>
                        {table.seats.map((seat, seatIndex) => <i
                          key={seat.id}
                          className={seat.occupied ? styles.seatOccupied : ''}
                          title={`Seat ${seatIndex + 1}: ${seat.occupied ? 'occupied' : 'vacant'}`}
                        />)}
                      </div>
                    </div>
                    {table.status === 'seated' && <button title="Acknowledge staff visit" onClick={() => void staffVisited(table.id)}>Attended</button>}
                  </div>
                </article>)}</div> : <div className={styles.seatTilesLoading}><span/><span/><span/><span/></div>}
                <div className={styles.seatsFoot}><span><i /> {tables.length} zones configured</span><span>{occupiedCount} / {totalSeats} seats occupied</span></div>
              </section>

              <section className={styles.alertCard} id="alerts">
                <div className={styles.cardHeader}>
                  <div><span className={styles.sectionIndex}>03 / ALERTS</span><h2>Active alerts</h2></div>
                  <div className={styles.alertCount}>{alerts.length}</div>
                </div>
                {alerts.length ? (
                  <ul className={styles.alertList}>
                    {[...alerts].reverse().map((alert) => (
                      <li key={alert.id}>
                        <span className={`${styles.alertSymbol} ${alert.type === 'hand_raise' ? styles.handAlert : ''}`}>
                          {alert.type === 'hand_raise' ? '✋' : '!'}
                        </span>
                        <div className={styles.alertBody}>
                          <span className={styles.alertType}>{alert.type.replace('_', ' ')}</span>
                          <strong>{alert.message}</strong>
                          <small>Video @ {formatDuration(alert.occurredAt)}</small>
                        </div>
                        <Icon name="arrow" />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={styles.emptyAlerts}>
                    <div className={styles.alertOrbit}><Icon name="bell" /></div>
                    <strong>All tables serviced</strong>
                    <p>No active alerts. Unattended guests and service calls appear here in real time.</p>
                  </div>
                )}
                <div className={styles.alertFoot}>
                  <span><i /> {alerts.length} ACTIVE · {snapshot?.resolvedAlertCount ?? 0} RESOLVED</span>
                  <button title="Live alert dispatching active">
                    <Icon name="spark" />
                    <span>Active monitor</span>
                  </button>
                </div>
              </section>
            </div>
          </div>

          <footer className={styles.footer}><span>SEESERVE <i>×</i> SERVICE, MADE VISIBLE</span><span>LOCAL DEMO ENVIRONMENT <b>·</b> NO LOCAL FRAME STORAGE</span></footer>
        </div>
      </main>
    </div>
  );
}
