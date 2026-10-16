import DigitPanel from '@/pages/bot-builder/digit-panel/digit-panel';
import { observer } from 'mobx-react-lite';

const Analysis = () => {
    return (
        <div className='digit-panel-page'>
            <DigitPanel />
        </div>
    );
};

export default observer(Analysis);
