import React from 'react';


interface Props {
  onRestart: () => void
}

const Done: React.FunctionComponent<Props> = ({onRestart}) => {
  return <div>
    <h2>Calibration complete</h2>
    <p>You're all done!</p>
    <p>
      <button className="button button-outline" onClick={onRestart}>Restart</button>
    </p>
  </div>
};

export default Done;
