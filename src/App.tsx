import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { BackgroundMusic, MusicToggleButton } from './components/audio/BackgroundMusic';
import { IntroScreen } from './components/intro/IntroScreen';
import { StoryController } from './components/story/StoryController';

function App() {
  const [hasEntered, setHasEntered] = useState(false);

  return (
    <BackgroundMusic>
      <StoryController />
      {hasEntered && <MusicToggleButton />}
      <AnimatePresence>
        {!hasEntered && <IntroScreen onEnter={() => setHasEntered(true)} />}
      </AnimatePresence>
    </BackgroundMusic>
  );
}

export default App;
