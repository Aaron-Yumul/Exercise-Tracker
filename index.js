require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const app = express();

mongoose.connect(process.env.MONGO_URI)
  .catch(err => console.error('Mongo connection error:', err.message));

const userSchema = new mongoose.Schema({
  username: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

const exerciseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  description: { type: String, required: true },
  duration: { type: Number, required: true },
  date: { type: Date, required: true }
});
const Exercise = mongoose.model('Exercise', exerciseSchema);

// Turns "yyyy-mm-dd" into a local-midnight date so toDateString() never shifts a day.
// With no input, returns today at midnight.
const parseDate = (input) => {
  if (!input) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(input);
};

app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Create a user
app.post('/api/users', async (req, res) => {
  try {
    const user = await User.create({ username: req.body.username });
    res.json({ username: user.username, _id: user._id });
  } catch (e) {
    res.json({ error: 'could not create user' });
  }
});

// List all users
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username _id');
    res.json(users);
  } catch (e) {
    res.json({ error: 'could not fetch users' });
  }
});

// Add an exercise
app.post('/api/users/:_id/exercises', async (req, res) => {
  try {
    const user = await User.findById(req.params._id);
    if (!user) return res.json({ error: 'user not found' });

    const { description, duration, date } = req.body;
    const exerciseDate = parseDate(date);
    if (isNaN(exerciseDate.getTime())) return res.json({ error: 'Invalid Date' });

    const exercise = await Exercise.create({
      userId: user._id,
      description,
      duration: Number(duration),
      date: exerciseDate
    });

    res.json({
      username: user.username,
      description: exercise.description,
      duration: exercise.duration,
      date: exercise.date.toDateString(),
      _id: user._id
    });
  } catch (e) {
    res.json({ error: 'could not add exercise' });
  }
});

// Get a user's log (supports ?from=&to=&limit=)
app.get('/api/users/:_id/logs', async (req, res) => {
  try {
    const user = await User.findById(req.params._id);
    if (!user) return res.json({ error: 'user not found' });

    const { from, to, limit } = req.query;
    const filter = { userId: user._id };

    const dateFilter = {};
    if (from) {
      const fromDate = parseDate(from);
      if (!isNaN(fromDate.getTime())) dateFilter.$gte = fromDate;
    }
    if (to) {
      const toDate = parseDate(to);
      if (!isNaN(toDate.getTime())) dateFilter.$lte = toDate;
    }
    if (Object.keys(dateFilter).length) filter.date = dateFilter;

    let query = Exercise.find(filter).sort({ date: 1 });
    if (limit && Number(limit) > 0) query = query.limit(Number(limit));
    const exercises = await query;

    const log = exercises.map(e => ({
      description: e.description,
      duration: e.duration,
      date: e.date.toDateString()
    }));

    res.json({
      username: user.username,
      count: log.length,
      _id: user._id,
      log
    });
  } catch (e) {
  console.error(e);
  res.json({ error: e.message });
  }
});

const port = process.env.PORT || 3000;

app.get('/api/status', (req, res) => {
  res.json({
    hasUri: !!process.env.MONGO_URI,
    dbState: mongoose.connection.readyState
  });
});

app.listen(port, () => {
  console.log('Listening on port ' + port);
});

module.exports = app;
