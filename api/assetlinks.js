import statements from '../public/.well-known/assetlinks.json' with { type: 'json' };

// Chrome reads this without a session to verify the installed Android app.
// Serve it explicitly instead of relying on deployment of a hidden directory.
export default function assetlinks(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).json(statements);
}
