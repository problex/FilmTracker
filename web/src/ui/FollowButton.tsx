import type { Account } from "./useAccount";

/**
 * Follow toggle for a film row.
 *
 * Following takes no target price here — one click, no dialogue, no interrupted
 * browsing. Targets are set on the account page, where the whole followed list is
 * visible and comparable. Signed out, this is a link to sign in rather than a dead
 * control, so the reason it does nothing is on screen.
 */
export function FollowButton({ account, filmId }: { account: Account; filmId: string }) {
  const following = account.follows.has(filmId);

  if (!account.signedIn) {
    return (
      <a
        className="followBtn followBtnMuted"
        href="#/account"
        onClick={(e) => e.stopPropagation()}
        title="Sign in to get price alerts for this film"
      >
        ☆ Follow
      </a>
    );
  }

  return (
    <button
      type="button"
      className={`followBtn${following ? " followBtnOn" : ""}`}
      aria-pressed={following}
      title={following ? "Stop alerts for this film" : "Email me when this gets cheaper"}
      onClick={(e) => {
        // The row itself opens the film's detail; following must not also do that.
        e.stopPropagation();
        void (following ? account.unfollow(filmId) : account.follow(filmId));
      }}
    >
      {following ? "★ Following" : "☆ Follow"}
    </button>
  );
}
