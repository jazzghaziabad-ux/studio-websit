import { html, mount, renderShell, sArr, setMeta, addJsonLd, pageError } from "../core.js";
import { intro, faqList } from "../components.js";

try {
  const { settings: s } = await renderShell();
  const faq = sArr(s, "faq");
  setMeta("Questions", "Answers about booking, payment, delivery and travel.");
  if (faq.length) addJsonLd({ "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
  mount("#main", html`${intro("Questions")}<div class="wrap" style="max-width:48rem;margin-left:max(1.25rem,calc((100% - 76rem)/2));padding-bottom:6rem">${faqList(faq)}</div>`);
} catch (err) { pageError("#main", err); }
