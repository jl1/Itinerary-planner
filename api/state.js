import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    if (req.method === 'GET') {
        const state = await kv.get('itinerary-state');
        res.status(200).json(state || {});
    } else if (req.method === 'POST') {
        const data = req.body;
        await kv.set('itinerary-state', data);
        res.status(200).json({ ok: true });
    } else {
        res.status(405).end();
    }
}