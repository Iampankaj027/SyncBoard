const supabase = require('../db/supabaseClient');

// GET /api/strokes/:roomId
const getStrokes = async (req, res) => {
  const { roomId } = req.params;

  const { data, error } = await supabase
    .from('strokes')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

// POST /api/strokes
const saveStroke = async (req, res) => {
  const { room_id, path_data } = req.body;

  if (!room_id || !path_data) {
    return res.status(400).json({ error: 'room_id and path_data are required' });
  }

  const { data, error } = await supabase
    .from('strokes')
    .insert([{ room_id, path_data }])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
};

// DELETE /api/strokes/:roomId  (for Clear Board)
const clearStrokes = async (req, res) => {
  const { roomId } = req.params;

  const { error } = await supabase
    .from('strokes')
    .delete()
    .eq('room_id', roomId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: `Board cleared for room: ${roomId}` });
};

module.exports = { getStrokes, saveStroke, clearStrokes };