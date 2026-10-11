import { useState } from 'react';
import { API_URL, subscribe } from '../lib/api.js';

export default function Subscribe({ city }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ status: 'idle', message: '' });
  const live = Boolean(API_URL);

  async function onSubmit(e) {
    e.preventDefault();
    setState({ status: 'busy', message: '' });
    try {
      const res = await subscribe(email, city.slug);
      setState({ status: 'done', message: res.message });
      setEmail('');
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  }

  return (
    <section className="subscribe">
      <h2>Email me before smoke reaches {city.name}</h2>
      <p className="lede">One email when moderate or heavy smoke is due within 24 hours. At most one every 12 hours.</p>
      <form onSubmit={onSubmit}>
        <label className="visually-hidden" htmlFor="email">Email address</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={!live || state.status === 'busy'}
        />
        <button type="submit" className="btn" disabled={!live || state.status === 'busy'}>
          {state.status === 'busy' ? 'Subscribing' : `Get ${city.name} alerts`}
        </button>
      </form>
      {!live && <p className="note">Alerts switch on once the app is connected to the AWS backend.</p>}
      {state.message && <p className={state.status === 'error' ? 'note is-error' : 'note is-ok'} role="status">{state.message}</p>}
    </section>
  );
}
