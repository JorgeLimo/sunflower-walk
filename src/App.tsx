import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { BackgroundMusic, MusicToggleButton, VolumeControl } from './components/audio/BackgroundMusic';
import { SongBubbleDirector } from './components/audio/SongBubbleDirector';
import { IntroScreen } from './components/intro/IntroScreen';
import { OrientationGuard } from './components/intro/OrientationGuard';
import { StoryController } from './components/story/StoryController';
import { markExperienceStarted } from './lib/experienceStore';

function App() {
  const [hasEntered, setHasEntered] = useState(false);

  return (
    <BackgroundMusic>
      <StoryController />
      <SongBubbleDirector enabled={hasEntered} />
      {hasEntered && (
        <>
          <VolumeControl />
          <MusicToggleButton />
        </>
      )}
      <AnimatePresence>
        {!hasEntered && <IntroScreen onEnter={() => {
          markExperienceStarted();
          setHasEntered(true);
        }} />}
      </AnimatePresence>
      <OrientationGuard />
    </BackgroundMusic>
  );
}

export default App;
