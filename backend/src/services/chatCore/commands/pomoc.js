import { listCommands } from '../slashDispatch.js';

export const pomocCommand = {
  mode: 'bypass',
  async run() {
    return {
      mode: 'bypass',
      reply: `Dostępne komendy: ${listCommands().join(', ')}`,
    };
  },
};
