// @ts-nocheck -- bridges typed React with vendored Blockly/runtime APIs.
import React from 'react';
import { observer } from 'mobx-react-lite';
import Button from '@/components/shared_ui/button';
import { load, save_types } from '@/external/bot-skeleton';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import { Localize, localize } from '@deriv-com/translations';
import { FREE_BOTS } from './catalog';
import type { FreeBot } from './types';
import './free-bots.scss';

const CUSTOM_BOTS_KEY = 'letustradenow.custom-xml-bots.v1';
const MAX_XML_BYTES = 2 * 1024 * 1024;

/** Keep trade parameters visible; leave purchase/risk/scan stacks collapsed. */
const VISIBLE_MAIN_TYPES = new Set(['trade_definition']);
const FORCE_COLLAPSED_TYPES = new Set([
    'before_purchase',
    'after_purchase',
    'during_purchase',
    'procedures_defnoreturn',
    'procedures_defreturn',
]);

type CustomXmlBot = { id: string; title: string; xml: string };

const readCustomBots = (): CustomXmlBot[] => {
    try {
        const saved = window.localStorage.getItem(CUSTOM_BOTS_KEY);
        const parsed = saved ? JSON.parse(saved) : [];
        return Array.isArray(parsed)
            ? parsed.filter(
                  item =>
                      item &&
                      typeof item.id === 'string' &&
                      typeof item.title === 'string' &&
                      typeof item.xml === 'string'
              )
            : [];
    } catch {
        return [];
    }
};

const validateXml = (xml: string) => {
    if (!xml.trim()) throw new Error(localize('The XML file is empty.'));
    if (new Blob([xml]).size > MAX_XML_BYTES) {
        throw new Error(localize('The XML file is too large. Please use a file under 2 MB.'));
    }
    if (typeof DOMParser === 'undefined') {
        throw new Error(localize('This browser cannot read XML files.'));
    }
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror') || doc.documentElement?.tagName.toLowerCase() !== 'xml') {
        throw new Error(localize('This is not valid Blockly bot XML. Choose a Deriv Bot .xml file.'));
    }
    return doc;
};

const getBlocklyXml = (Blockly: any, xml: string) => {
    const parser = Blockly?.Xml?.textToDom || Blockly?.utils?.xml?.textToDom;
    if (typeof parser === 'function') return parser.call(Blockly.Xml || Blockly.utils.xml, xml);
    return new DOMParser().parseFromString(xml, 'application/xml').documentElement;
};

const applyFreeBotCollapseState = (workspace: any) => {
    if (!workspace?.getAllBlocks) return;
    workspace.getAllBlocks(false).forEach((block: any) => {
        if (!block || typeof block.setCollapsed !== 'function') return;
        if (VISIBLE_MAIN_TYPES.has(block.type)) {
            if (block.isCollapsed?.()) block.setCollapsed(false);
            return;
        }
        if (FORCE_COLLAPSED_TYPES.has(block.type)) {
            if (!block.isCollapsed?.()) block.setCollapsed(true);
            return;
        }
        const block_id = String(block.id || '');
        if (
            block_id.includes('_advanced_init') ||
            block_id.includes('_scan_loop') ||
            block.type === 'controls_whileUntil'
        ) {
            if (!block.isCollapsed?.()) block.setCollapsed(true);
        }
    });
    if (typeof workspace.render === 'function') workspace.render();
};

const FreeBots = () => {
    const { dashboard, run_panel } = useStore();
    const [status_by_id, setStatusById] = React.useState<Record<string, string>>({});
    const [busy_id, setBusyId] = React.useState<string | null>(null);
    const [custom_bots, setCustomBots] = React.useState<CustomXmlBot[]>(() =>
        typeof window === 'undefined' ? [] : readCustomBots()
    );
    const [upload_status, setUploadStatus] = React.useState('');
    const [is_uploading, setIsUploading] = React.useState(false);
    const file_input_ref = React.useRef<HTMLInputElement>(null);

    const setStatus = (bot_id: string, message: string) => {
        setStatusById(prev => ({ ...prev, [bot_id]: message }));
    };

    const persistCustomBots = (next: CustomXmlBot[]) => {
        setCustomBots(next);
        try {
            window.localStorage.setItem(CUSTOM_BOTS_KEY, JSON.stringify(next));
        } catch {
            setUploadStatus(localize('Could not save bots on this device. Free some browser storage and try again.'));
        }
    };

    const addCustomXml = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setIsUploading(true);
        setUploadStatus('');
        try {
            if (!file.name.toLowerCase().endsWith('.xml') && file.type && !/xml/i.test(file.type)) {
                throw new Error(localize('Choose an XML file with the .xml extension.'));
            }
            if (file.size > MAX_XML_BYTES) {
                throw new Error(localize('The XML file is too large. Please use a file under 2 MB.'));
            }
            const xml = await file.text();
            validateXml(xml);
            const title = file.name.replace(/\.xml$/i, '').trim() || localize('My custom bot');
            const bot: CustomXmlBot = {
                id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                title,
                xml,
            };
            persistCustomBots([bot, ...custom_bots.filter(item => item.title !== title)].slice(0, 30));
            setUploadStatus(localize('{{title}} added. Tap Load to open it in Bot Builder.', { title }));
        } catch (error) {
            setUploadStatus(error?.message || localize('Could not add this XML bot.'));
        } finally {
            setIsUploading(false);
        }
    };

    const loadXmlIntoWorkspace = async (xml: string, title: string) => {
        // Open the builder first because its Blockly workspace may not exist while another tab is active.
        dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
        let workspace: any;
        for (let attempt = 0; attempt < 40; attempt += 1) {
            workspace = window.Blockly?.derivWorkspace;
            if (workspace && !workspace.isDisposed?.()) break;
            await new Promise(resolve => window.setTimeout(resolve, 150));
        }
        if (!workspace || workspace.isDisposed?.()) {
            throw new Error(localize('Bot Builder did not finish starting. Open Bot Builder and try Load again.'));
        }

        const Blockly = window.Blockly;
        const xmlDom = getBlocklyXml(Blockly, xml);
        if (!xmlDom || xmlDom.nodeName?.toLowerCase() !== 'xml') {
            throw new Error(localize('The file does not contain a Blockly bot workspace.'));
        }

        const xmlApi = Blockly?.Xml || Blockly?.utils?.xml;
        if (typeof xmlApi?.domToWorkspace !== 'function') {
            throw new Error(localize('The Blockly XML importer is not ready. Refresh the page and try again.'));
        }

        // Keep a backup so an incompatible bot does not leave the user's current workspace blank.
        const previousDom = typeof xmlApi.workspaceToDom === 'function' ? xmlApi.workspaceToDom(workspace) : null;
        try {
            workspace.clear();
            xmlApi.domToWorkspace(xmlDom, workspace);
            applyFreeBotCollapseState(workspace);
            workspace.render?.();
            Blockly.svgResize?.(workspace);
        } catch (error) {
            try {
                workspace.clear();
                if (previousDom) xmlApi.domToWorkspace(previousDom, workspace);
                workspace.render?.();
            } catch {
                // Preserve the original import error; the UI reports it below.
            }
            throw new Error(
                error?.message ||
                    localize('This bot uses blocks that are not supported by the current Bot Builder.')
            );
        }
        return localize('{{title}} opened in Bot Builder.', { title });
    };

    const loadBot = async (bot: FreeBot) => {
        try {
            setBusyId(bot.id);
            setStatus(bot.id, localize('Opening bot in Bot Builder...'));
            // Keep the existing Deriv importer for the published catalogue bots.
            dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
            let workspace = window.Blockly?.derivWorkspace;
            if (!workspace) {
                for (let attempt = 0; attempt < 40; attempt += 1) {
                    await new Promise(resolve => window.setTimeout(resolve, 150));
                    workspace = window.Blockly?.derivWorkspace;
                    if (workspace) break;
                }
            }
            if (!workspace) throw new Error(localize('Bot Builder did not finish starting. Please try again.'));
            const result = await load({
                block_string: bot.xml,
                file_name: bot.title,
                workspace,
                from: save_types.UNSAVED,
                drop_event: null,
                strategy_id: null,
                showIncompatibleStrategyDialog: null,
            });
            if (result?.error) throw new Error(result.error);
            applyFreeBotCollapseState(workspace);
            setStatus(bot.id, localize('{{title}} opened in Bot Builder.', { title: bot.title }));
        } catch (error) {
            setStatus(bot.id, error?.message || localize('Could not load this bot.'));
        } finally {
            setBusyId(null);
        }
    };

    const loadCustomBot = async (bot: CustomXmlBot) => {
        try {
            setBusyId(bot.id);
            setStatus(bot.id, localize('Opening XML in Bot Builder...'));
            const message = await loadXmlIntoWorkspace(bot.xml, bot.title);
            setStatus(bot.id, message);
        } catch (error) {
            setStatus(bot.id, error?.message || localize('Could not open this XML bot.'));
        } finally {
            setBusyId(null);
        }
    };

    const removeCustomBot = (bot: CustomXmlBot) => {
        persistCustomBots(custom_bots.filter(item => item.id !== bot.id));
        setUploadStatus(localize('{{title}} removed from this device.', { title: bot.title }));
    };

    return (
        <div className='free-bots'>
            <header className='free-bots__header'>
                <h2 className='free-bots__title'><Localize i18n_default_text='Free Bots' /></h2>
            </header>

            <section className='free-bots__custom-import' aria-label={localize('Add your own bot')}>
                <div className='free-bots__import-copy'>
                    <h3 className='free-bots__section-title'><Localize i18n_default_text='Add your own XML bot' /></h3>
                    <p className='free-bots__import-help'>
                        <Localize i18n_default_text='Choose a Deriv Bot XML file from your device. It will be saved in this browser and can be opened in Bot Builder.' />
                    </p>
                </div>
                <input
                    ref={file_input_ref}
                    className='free-bots__file-input'
                    type='file'
                    accept='.xml,application/xml,text/xml'
                    onChange={addCustomXml}
                    aria-label={localize('Choose XML bot file')}
                />
                <Button
                    className='free-bots__button'
                    primary
                    type='button'
                    is_disabled={is_uploading}
                    onClick={() => file_input_ref.current?.click()}
                >
                    {is_uploading ? localize('Adding XML...') : localize('Choose XML file')}
                </Button>
                {upload_status && <p className='free-bots__status' role='status'>{upload_status}</p>}
            </section>

            {custom_bots.length > 0 && (
                <section className='free-bots__custom-section'>
                    <h3 className='free-bots__section-title'><Localize i18n_default_text='Your bots on this device' /></h3>
                    <ul className='free-bots__grid'>
                        {custom_bots.map((bot, index) => {
                            const is_busy = busy_id === bot.id;
                            const status = status_by_id[bot.id];
                            return (
                                <li key={bot.id} className='free-bots__card'>
                                    <div className='free-bots__card-top'>
                                        <span className='free-bots__badge'>{index + 1}</span>
                                        <h3 className='free-bots__card-title'>{bot.title}</h3>
                                    </div>
                                    <div className='free-bots__card-footer'>
                                        {status && <p className='free-bots__status' role='status'>{status}</p>}
                                        <Button
                                            className='free-bots__button'
                                            is_disabled={is_busy || run_panel.is_running}
                                            onClick={() => loadCustomBot(bot)}
                                            primary
                                            type='button'
                                        >
                                            {is_busy ? localize('Opening...') : localize('Open in Bot Builder')}
                                        </Button>
                                        <Button
                                            className='free-bots__button'
                                            is_disabled={is_busy}
                                            onClick={() => removeCustomBot(bot)}
                                            secondary
                                            type='button'
                                        >
                                            {localize('Remove')}
                                        </Button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            {FREE_BOTS.length === 0 ? (
                <div className='free-bots__empty'>
                    <p><Localize i18n_default_text='No published free bots yet. Add an XML bot above or check back later.' /></p>
                </div>
            ) : (
                <section className='free-bots__published-section'>
                    <h3 className='free-bots__section-title'><Localize i18n_default_text='Published bots' /></h3>
                    <ul className='free-bots__grid'>
                        {FREE_BOTS.map((bot, index) => {
                            const is_busy = busy_id === bot.id;
                            const status = status_by_id[bot.id];
                            return (
                                <li key={bot.id} className='free-bots__card'>
                                    <div className='free-bots__card-top'>
                                        <span className='free-bots__badge'>{index + 1}</span>
                                        <h3 className='free-bots__card-title'>{bot.title}</h3>
                                    </div>
                                    {!!bot.tags?.length && (
                                        <ul className='free-bots__tags' aria-label={localize('Tags')}>
                                            {bot.tags.map(tag => <li key={tag} className='free-bots__tag'>{tag}</li>)}
                                        </ul>
                                    )}
                                    <div className='free-bots__card-footer'>
                                        {status && <p className='free-bots__status' role='status'>{status}</p>}
                                        <Button
                                            className='free-bots__button'
                                            is_disabled={is_busy || run_panel.is_running}
                                            onClick={() => loadBot(bot)}
                                            primary
                                            type='button'
                                        >
                                            {is_busy ? localize('Loading...') : localize('Load into Bot Builder')}
                                        </Button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}
        </div>
    );
};

export default observer(FreeBots);
