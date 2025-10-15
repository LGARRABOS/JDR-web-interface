import { Router } from 'express';
import { roll } from '../controllers/rollController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.post('/', authenticate, roll);

export default router;
