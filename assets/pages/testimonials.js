import { html, mount, renderShell, getPublicReviews, getReviewStats, setMeta, pageError } from "../core.js";
import { intro, reviewList, stars } from "../components.js";

try {
  const [, reviews, stats] = await Promise.all([renderShell(), getPublicReviews(100), getReviewStats()]);
  setMeta("Testimonials", "Reviews from clients with completed bookings.");
  mount("#main", html`${intro("Testimonials", "Every review here comes from a client with a completed booking. We publish honest ratings, not only five-star ones.")}
    <div class="wrap" style="padding-bottom:6rem">
      ${stats.review_count > 0 && stats.average_rating != null ? html`<p style="margin-bottom:3rem"><span class="display" style="font-size:3rem">${Number(stats.average_rating).toFixed(1)} / 5</span> ${stars(stats.average_rating)}
        <span class="muted">from ${stats.review_count} review${stats.review_count === 1 ? "" : "s"}</span></p>` : ""}
      ${reviewList(reviews)}</div>`);
} catch (err) { pageError("#main", err); }
