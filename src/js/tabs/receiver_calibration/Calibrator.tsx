import React, {useState} from 'react';
import Initial from './steps/Initial'
import Calibrate from './steps/Calibrate'
import Done from './steps/Done'
import styles from './Calibrator.module.css';

const steps = {
    INITIAL: 'initial',
    CALIBRATE: 'calibrate',
    DONE: 'done'
};

const Calibrator: React.FunctionComponent = () => {
    const [step, setStep] = useState(steps.INITIAL);

    function handleStartCalibration() {
        setStep(steps.CALIBRATE);
    }

    function handleRestart() {
        setStep(steps.INITIAL);
    }

    function handleDone() {
        setStep(steps.DONE);
    }

    return (
        <div className={styles.Calibrator}>
            {step === steps.INITIAL && <Initial onStart={handleStartCalibration} />}
            {step === steps.CALIBRATE && <Calibrate onDone={handleDone} onRestart={handleRestart} />}
            {step === steps.DONE && <Done onRestart={handleRestart} />}
        </div>
    )
};

export default Calibrator
