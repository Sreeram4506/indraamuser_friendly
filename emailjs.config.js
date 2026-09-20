/*
  EmailJS client configuration.

  This sends a copy of every contact-form submission straight to an inbox,
  in addition to /api/contact (which always logs the lead to the admin
  dashboard regardless of whether this succeeds — see api/_lib/core.js).

  Reusing the same EmailJS account/credentials as norwoodgulf-master, per
  explicit instruction. Swap these for Indraam's own EmailJS account
  (https://www.emailjs.com/ → Email Services → Email Templates → Account →
  API Keys) if submissions should land in a different inbox later.
*/
window.INDRAAM_EMAILJS_CONFIG = {
  publicKey: 'fWMjUb3nyc5iqIdCq',
  contact: {
    serviceId: 'service_0mqrnkb',
    templateId: 'template_n8y37fa'
  }
};
