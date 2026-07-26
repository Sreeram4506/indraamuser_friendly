import netlify from '../../api/_lib/netlify.js';
import core from '../../api/_lib/core.js';

export default netlify.toNetlify(core.runContact);
export const config = { path: '/api/contact' };
