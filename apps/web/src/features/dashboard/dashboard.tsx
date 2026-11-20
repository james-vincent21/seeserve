'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { analyzeFrame, getDemoState, registerStaffVisit, resetDemo, type DemoSnapshot } from '@/shared/api/client';
import styles from './dashboard.module.css';

const FRAME_INTERVAL_MS = Number(process.env.NEXT_PUBLIC_DEMO_FRAME_INTERVAL_MS ?? 3000);
const MAX_FRAME_WIDTH = 640;

export function Dashboard() {
  const [snapshot, setSnapshot] = useState<DemoSnapshot | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
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
      setError('API পাওয়া যাচ্ছে না। Express API ও PostgreSQL চালু করুন।');
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
      const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Could not prepare a frame in memory');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Frame encoding failed')), 'image/jpeg', 0.65);
      });
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not encode frame'));
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.readAsDataURL(blob);
      });
      setSnapshot(await analyzeFrame(base64, video.currentTime));
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Frame analysis failed');
      video.pause();
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void processCurrentFrame(), FRAME_INTERVAL_MS);
    return () => window.clearInterval(timer);
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

  const tables = snapshot?.tables ?? [];
  const alerts = snapshot?.alerts ?? [];

  const staffVisited = async (tableId: string) => {
    try {
      const videoTimeSeconds = videoRef.current?.currentTime ?? 0;
      setSnapshot(await registerStaffVisit(tableId, videoTimeSeconds));
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Staff visit failed');
    }
  };

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>RESTAURANT VISION · RECORDED CLIP DEMO</p><h1>Floor dashboard</h1></div>
        <span className={styles.mode}>{snapshot?.inferenceMode === 'http' ? 'YOLOv8 API' : 'Mock inference'} · sampled every {FRAME_INTERVAL_MS / 1000} sec</span>
      </header>

      <section className={styles.videoPanel}>
        <div className={styles.videoHeading}>
          <div><h2>Demo video</h2><p>ভিডিওটি browser-এ local থাকে; sampled frame inference API-তে পাঠানো হয়।</p></div>
          <div className={styles.controls}>
            <label className={styles.fileButton}>Choose video<input type="file" accept="video/*" onChange={onChooseVideo} /></label>
            <button className={styles.primaryButton} disabled={!videoUrl || busy} onClick={() => void startDemo()}>
              {busy ? 'Analyzing…' : 'Reset & play'}
            </button>
          </div>
        </div>
        {videoUrl ? <video
          ref={videoRef}
          className={styles.video}
          src={videoUrl}
          controls
          playsInline
          onPlay={() => setBusy(true)}
          onPause={() => setBusy(false)}
          onEnded={() => setBusy(false)}
        /> : <div className={styles.videoPlaceholder}>Choose your staged recorded video to begin.</div>}
        <canvas ref={canvasRef} className={styles.hiddenCanvas} aria-hidden="true" />
        <div className={styles.usage}>Frames analyzed: {snapshot?.analyzedFrames ?? 0} / {snapshot?.maxFrames ?? 100}</div>
      </section>

      {error && <p className={styles.error}>{error}</p>}

      <section className={styles.section}>
        <div className={styles.sectionTitle}><div><h2>Tables</h2><p>Occupancy is estimated from person detections inside configured zones.</p></div><span>{tables.length} configured</span></div>
        <div className={styles.grid}>
          {tables.map((table) => <article className={styles.card} key={table.id}>
            <div className={styles.cardTop}><h3>{table.label}</h3><span className={`${styles.dot} ${styles[table.status]}`} /></div>
            <p className={styles.status}>{table.status}</p>
            <small>{table.seatedAt === null ? 'No active seating' : `Video time: ${table.seatedAt.toFixed(1)}s`}</small>
            {table.status === 'seated' && <button className={styles.visitButton} onClick={() => void staffVisited(table.id)}>Staff visited</button>}
          </article>)}
        </div>
      </section>

      <section className={styles.events}>
        <div className={styles.sectionTitle}><div><h2>Recent alerts</h2><p>Event metadata is saved in PostgreSQL; frame data is not stored.</p></div><span>{alerts.length}</span></div>
        {alerts.length ? <ul className={styles.alertList}>{[...alerts].reverse().map((alert) => <li key={alert.id}>
          <span className={styles.alertBadge}>{alert.type.replace('_', ' ').toUpperCase()}</span><strong>{alert.message}</strong><small>Video {alert.occurredAt.toFixed(1)}s</small>
        </li>)}</ul> : <p className={styles.empty}>No alerts yet. Start the video to run the demo.</p>}
      </section>
    </main>
  );
}
