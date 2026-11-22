import { demoAppUrl } from './config';
import type { DemoTeammate } from './config';
import { LiveSlide } from './Slide';

/**
 * The phone screen is 293 x 636 on the stage. The app inside is drawn 430 x 932 (the screen of an iPhone Pro Max,
 * the same shape as the real phone), then scaled to fit.
 */
const APP_W = 430;
const APP_H = 932;
const SCREEN_W = 293;
const K = SCREEN_W / APP_W;

/**
 * Deck slide 11, as a live page: the Budy phone app inside a phone frame.
 * The app opens already signed in as `teammate`. Reps can still switch persona inside the app. The address is built in config.ts.
 */
export function AppSlide({ teammate, name, text }: { teammate: DemoTeammate; name: string; text: string }) {
  return (
    <LiveSlide label="Live demo" bg="#0B2038">
      <span className="sl-eyebrow sl-eyebrow--light as-eyebrow">Live demo</span>
      <h2 className="as-title">Meet {name}.</h2>
      <p className="as-text">{text}</p>

      <div className="phone">
        <div className="phone-screen">
          <span className="phone-wait">Live app</span>
          <iframe
            className="phone-iframe"
            title="Budy app demo"
            src={demoAppUrl(teammate)}
            loading="lazy"
            allow="microphone; autoplay"
            style={{ width: APP_W, height: APP_H, transform: `scale(${K})` }}
          />
        </div>
      </div>
    </LiveSlide>
  );
}
