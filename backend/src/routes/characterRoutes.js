import { Router } from 'express';
import {
  createCharacter,
  getCharacters,
  updateCharacter,
} from '../controllers/characterController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticate, getCharacters);
router.post('/', authenticate, createCharacter);
router.put('/:id', authenticate, updateCharacter);

export default router;
