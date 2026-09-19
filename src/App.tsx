import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { BackgroundMusic, MusicToggleButton } from './components/audio/BackgroundMusic';
import { SongBubbleDirector } from './components/audio/SongBubbleDirector';
import { IntroScreen } from './components/intro/IntroScreen';
import { StoryController } from './components/story/StoryController';

function App() {
  const [hasEntered, setHasEntered] = useState(false);

  return (
    <BackgroundMusic>
      <StoryController />
      <SongBubbleDirector enabled={hasEntered} />
      {hasEntered && <MusicToggleButton />}
      <AnimatePresence>
        {!hasEntered && <IntroScreen onEnter={() => setHasEntered(true)} />}
      </AnimatePresence>
    </BackgroundMusic>
  );
}

export default App;
