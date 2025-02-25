import * as React from 'react';
import moment, {duration} from 'moment';
import {parseTimeEntryDuration} from './duration-input-converter';
import EditForm from './edit-form.component';
import * as ReactDOM from 'react-dom';
import EditFormManual from './edit-form-manual.component';
import {isOffline} from "./check-connection";
import {getIconStatus} from "../enums/browser-icon-status-enum";
import {Application} from "../application";
import {TimeEntryHelper} from "../helpers/timeEntry-helper";
import {TimeEntryService} from "../services/timeEntry-service";
import {getKeyCodes} from "../enums/key-codes.enum";
import {getBrowser} from "../helpers/browser-helper";
import {LocalStorageService} from "../services/localStorage-service";
import { ProjectService } from '../services/project-service';
import {DefaultProject} from '../helpers/storageUserWorkspace';
import {offlineStorage} from '../helpers/offlineStorage';
import locales from "../helpers/locales";

const timeEntryHelper = new TimeEntryHelper();
const timeEntryService = new TimeEntryService();
const localStorageService = new LocalStorageService();
const projectService = new ProjectService()
let interval;

class StartTimer extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            timeEntry: {},
            time: moment().hour(0).minute(0).second(0).format('HH:mm:ss'),
            interval: "",
            mode: this.props.mode,
            stopDisabled: false
        };
        this.application = new Application();
        this.startNewEntry = this.startNewEntry.bind(this);
    }

    async componentDidMount() {
        this.getTimeEntryInProgress();
    }  

    componentWillUnmount() {
        if (interval) {
            clearInterval(interval);
        }
    }

    async getTimeEntryInProgress() {
        if (await isOffline()) {
            this.setState({
                timeEntry: offlineStorage.timeEntryInOffline ? offlineStorage.timeEntryInOffline : {}
            }, () => {
                if(this.state.timeEntry.timeInterval) {
                    let currentPeriod = moment().diff(moment(this.state.timeEntry.timeInterval.start));
                    interval = setInterval(() => {
                        currentPeriod = currentPeriod + 1000;
                        this.setState({
                            time: duration(currentPeriod).format('HH:mm:ss', {trim: false})
                        })
                    }, 1000);

                    this.props.changeMode('timer');
                    this.props.setTimeEntryInProgress(this.state.timeEntry);
                }
            })
        } else {
            timeEntryService.getEntryInProgress()
                .then(response => {
                    let timeEntry = response.data[0];
                    this.setTimeEntryInProgress(timeEntry);
                })
                .catch((error) => {
                    this.application.setIcon(getIconStatus().timeEntryEnded);
                })
        }
    }

    async setTimeEntryInProgress(timeEntry) {
        let inProgress = false;
        if (interval) {
            clearInterval(interval);
        }
        if (timeEntry) {
            this.setState({
                timeEntry
            }, () => {
                let currentPeriod = moment().diff(moment(timeEntry.timeInterval.start));
                interval = setInterval(() => {
                    currentPeriod = currentPeriod + 1000;
                    this.setState({
                        time: duration(currentPeriod).format('HH:mm:ss', {trim: false})
                    })
                }, 1000);
                this.props.changeMode('timer');
                this.props.setTimeEntryInProgress(timeEntry);
            });
            inProgress = true;
            this.application.setIcon(
                inProgress ? getIconStatus().timeEntryStarted : getIconStatus().timeEntryEnded
            );
            const { forceProjects, forceTasks } = this.props.workspaceSettings;
            const taskId = timeEntry.task ? timeEntry.task.id : timeEntry.taskId;

            // if (forceProjects && (!timeEntry.projectId || forceTasks && !taskId)) {
            if (!timeEntry.projectId || forceTasks && !taskId) {
                const {projectDB, taskDB} = await this.checkDefaultProjectTask(forceTasks);
                if (projectDB) {
                    const entry = await timeEntryHelper.updateProjectTask(timeEntry, projectDB, taskDB);
                    this.setState({
                        timeEntry: entry
                    })
                }
            }
        } 
        else {
            this.setState({
                timeEntry: {},
                time: moment().hour(0).minute(0).second(0).format('HH:mm:ss')
            });
            this.props.setTimeEntryInProgress(timeEntry);
            this.application.setIcon(
                inProgress ? getIconStatus().timeEntryStarted : getIconStatus().timeEntryEnded
            );
        }
    }

    async checkDefaultProjectTask(forceTasks) {
        // const { defaultProject } = DefaultProject.getStorage();
        // const lastEntry = this.props.timeEntries && this.props.timeEntries[0];
        // const isLastUsedProject = defaultProject.project.id === 'lastUsedProject';
        // const isLastUsedProjectWithoutTask = defaultProject.project.id === 'lastUsedProject' && !defaultProject.project.name.includes('task');

        // if(defaultProject && defaultProject.enabled){
        //     if (!isLastUsedProject) {
        //         const { projectDB, taskDB, msg } = await defaultProject.getProjectTaskFromDB(forceTasks);
        //         if (msg) {
        //             this.props.toaster.toast('info', msg, 5);
        //         }
        //         return {projectDB, taskDB};
        //     } else {
        //         if (!lastEntry) {
        //             this.props.toaster.toast('info', 'Your default project is no longer available. You can set a new one in Settings', 5);
        //             return {projectDB: null, taskDB: null};
        //         }
        //         let { project, task } = lastEntry;
    
        //         if(isLastUsedProjectWithoutTask){
        //             task = null;
        //         }
                
        //         return {projectDB: project, taskDB: task};
        //     }
        // }
        return {projectDB: null, taskDB: null};
    }

    setDescription(event) {
        let timeEntry = {
            description: event.target.value
        };

        this.setState({
            timeEntry: timeEntry
        })
    }
   
    setDuration(event) {
        let duration = parseTimeEntryDuration(event.target.value);

        if (!duration) {
            return;
        }

        let start = moment().add(-parseInt(duration.split(':')[0]), 'hours')
                            .add(-parseInt(duration.split(':')[1]), 'minutes')
                            .add(-parseInt(duration.split(':')[2]), 'seconds');
        let timeEntry = {
            timeInterval: {
                start: start,
                end: moment()
            }
        };

        this.setState({
            timeEntry: timeEntry
        });
    }

    async startNewEntry() {
        if (interval) {
            clearInterval(interval);
        }
        if (await isOffline()) {
            this.setState({
                timeEntry: {
                    workspaceId: await localStorageService.get('activeWorkspaceId'),
                    id: offlineStorage.timeEntryIdTemp,
                    description: this.state.timeEntry.description,
                    projectId: this.state.timeEntry.projectId,
                    timeInterval: {
                        start: moment()
                    },
                    customFieldValues: offlineStorage.customFieldValues // generated from wsCustomFields
                }
            }, () => {
                offlineStorage.timeEntryInOffline = this.state.timeEntry;
                this.props.changeMode('timer');
                this.props.setTimeEntryInProgress(this.state.timeEntry);
                this.goToEdit();
            });
        } 
        else {

            let { projectId, billable, task, description, customFieldValues, tags } = this.state.timeEntry;
            let taskId = task ? task.id : null;
            const tagIds = tags ? tags.map(tag => tag.id) : [];

            const { forceProjects, forceTasks } = this.props.workspaceSettings;
            //if (forceProjects && (!projectId || forceTasks && !taskId)) {
            if (!projectId || forceTasks && !taskId) {
                const {projectDB, taskDB} = await this.checkDefaultProjectTask(forceTasks);
                if (projectDB) {
                    projectId = projectDB.id;
                    if (taskDB) {
                        taskId = taskDB.id;
                    }
                    billable = projectDB.billable;
                }
            }
            const cfs = customFieldValues && customFieldValues.length > 0
                                ? customFieldValues.filter(cf => cf.customFieldDto.status === 'VISIBLE').map(({type, customFieldId, value}) => ({ 
                                    customFieldId,
                                    sourceType: 'TIMEENTRY',
                                    value: type === 'NUMBER' ? parseFloat(value) : value
                                }))
                                : [];

            timeEntryService.startNewEntry(
                projectId,
                description,
                billable,
                moment(),
                null,
                taskId,
                tagIds,
                cfs
            ).then(response => {
                let data = response.data;
                this.setState({
                    timeEntry: data
                }, () => {
                    this.props.changeMode('timer');
                    this.props.setTimeEntryInProgress(data);
                    this.application.setIcon(getIconStatus().timeEntryStarted);
                    
                    // const backgroundPage = getBrowser().extension.getBackgroundPage();
                    // backgroundPage.addIdleListenerIfIdleIsEnabled();
                    getBrowser().runtime.sendMessage({
                        eventName: 'addIdleListenerIfIdleIsEnabled'
                    });
                    // backgroundPage.removeReminderTimer();
                    getBrowser().runtime.sendMessage({
                        eventName: 'removeReminderTimer'
                    });
                    // backgroundPage.addPomodoroTimer();
                    getBrowser().runtime.sendMessage({
                        eventName: 'pomodoroTimer'
                    });
                    // backgroundPage.setTimeEntryInProgress(data);
                    localStorage.setItem({
                        timeEntryInProgress: data
                    });
                    
                    this.goToEdit();
                });
            })
            .catch(() => {
            });
        }
    }

    async checkRequiredFields() {
        const isOff = await isOffline();
        if (this.state.stopDisabled)
            return;

        if (isOff) {
            let timeEntryOffline = offlineStorage.timeEntryInOffline;
            if (!timeEntryOffline) {
                // user tries to Stop TimeEntry which has been started onLine
                const inProgress = await localStorage.getItem('inProgress');
                if (inProgress && JSON.parse(inProgress)) {
                    this.setTimeEntryInProgress(null);
                }
                return;
            }
        }

        this.setState({
            stopDisabled: true
        })

        const { forceDescription, forceProjects, forceTasks, forceTags} = this.props.workspaceSettings;
        const { description, project, task, tags } = this.state.timeEntry;

        if (isOff) {
            this.stopEntryInProgress();
        } else if(forceDescription && (description === "" || !description)) {
            this.goToEdit();
        } else if(forceProjects && !project) {
            this.goToEdit();
        } else if(forceTasks && !task) {
            this.goToEdit();
        }else if(forceTags && (!tags || !tags.length > 0)) {
            this.goToEdit();
        } else {
            this.stopEntryInProgress();
        }
    }

    async stopEntryInProgress() {
        getBrowser().runtime.sendMessage({
            eventName: "resetBadge"
        });
        if (await isOffline()) {
            let timeEntryOffline = offlineStorage.timeEntryInOffline;
            if (!timeEntryOffline) 
                return;
            timeEntryOffline.timeInterval.end = moment();
            timeEntryOffline.timeInterval.duration = duration(moment().diff(timeEntryOffline.timeInterval.start));
            const timeEntriesOffline = offlineStorage.timeEntriesOffline;
            timeEntriesOffline.push(timeEntryOffline);
            offlineStorage.timeEntriesOffline = timeEntriesOffline;
            offlineStorage.timeEntryInOffline = null;

            clearInterval(interval);
            interval = null
            this.setState({
                timeEntry: {},
                time: moment().hour(0).minute(0).second(0).format('HH:mm:ss'),
                interval: "",
                stopDisabled: false
            });
            document.getElementById('description').value = '';
            this.props.setTimeEntryInProgress(null);
            this.props.endStarted();
        } else {
            timeEntryService.stopEntryInProgress(moment())
                .then(() => {
                    clearInterval(interval);
                    interval = null
                    this.setState({
                        timeEntry: {},
                        time: moment().hour(0).minute(0).second(0).format('HH:mm:ss'),
                        stopDisabled: false
                    });
                    document.getElementById('description').value = '';
                    this.props.setTimeEntryInProgress(null);
                    this.props.endStarted();
                    
                    getBrowser().runtime.sendMessage({
                        eventName: 'removeIdleListenerIfIdleIsEnabled'
                    });
                    
                    getBrowser().runtime.sendMessage({
                        eventName: 'reminder'
                    });
                    
                    getBrowser().runtime.sendMessage({
                        eventName: 'removeAllPomodoroTimers'
                    });
                    
                    this.application.setIcon(getIconStatus().timeEntryEnded);
                })
                .catch(() => {
                    this.props.log('timeEntryService.stopEntryInProgress error')
                });
        }
    }

    changeMode(mode) {
        this.props.changeMode(mode);
    }

    goToEdit() {
        ReactDOM.unmountComponentAtNode(document.getElementById('mount'));
        ReactDOM.render(
            <EditForm changeMode={this.changeMode.bind(this)}
                      timeEntry={this.state.timeEntry}
                      timeEntries={this.props.timeEntries}
                      workspaceSettings={this.props.workspaceSettings}
                      timeFormat={this.props.timeFormat}
                      userSettings={this.props.userSettings}
            />, document.getElementById('mount')
        );
    }

    async goToEditManual() {
        const activeWorkspaceId = await localStorageService.get('activeWorkspaceId');
        if (!this.state.timeEntry.timeInterval) {
            this.setState({
                timeEntry: {
                    workspaceId: activeWorkspaceId,
                    timeInterval: {
                        start: moment(), 
                        end: moment()
                    }
                }
            }, () => {
                ReactDOM.unmountComponentAtNode(document.getElementById('mount'));
                ReactDOM.render(
                    <EditFormManual 
                        changeMode={this.changeMode.bind(this)}
                        workspaceSettings={this.props.workspaceSettings}
                        timeEntry={this.state.timeEntry}
                        timeEntries={this.props.timeEntries}
                        timeFormat={this.props.timeFormat}
                        userSettings={this.props.userSettings}
                    />, document.getElementById('mount')
                );
            })
        } 
        else {
            const { timeEntry } = this.state;
            if (!timeEntry.workspaceId)
                timeEntry.workspaceId = activeWorkspaceId;
            ReactDOM.unmountComponentAtNode(document.getElementById('mount'));
            ReactDOM.render(
                <EditFormManual
                    changeMode={this.changeMode.bind(this)}
                    workspaceSettings={this.props.workspaceSettings}
                    timeEntry={timeEntry}
                    timeEntries={this.props.timeEntries}
                    timeFormat={this.props.timeFormat}
                    userSettings={this.props.userSettings}
                />, document.getElementById('mount'));
        }
    }

    onKey(event) {
        const { enter, minus } = getKeyCodes();
        if (enter.includes(event.keyCode)) {
            if (event.target.id === 'description') {
                this.startNewEntry();
            }
            else if (event.target.id === 'duration') {
                this.goToEditManual();
            }
        }
    }

    render() {
        // console.log('this.state.timeEntry', this.state.timeEntry);
        const { id, description, task, project } = this.state.timeEntry;
        return (
           <div id="start-timer">
               <div className="start-timer">
                    {/* <span>Offline <input type='checkbox' checked={this.isChecked} onChange={this.handleChangeOffline} />  </span> */}
                    <span className={this.props.mode === 'timer' ? 'start-timer-description' : 'disabled'}>
                        <div onClick={this.goToEdit.bind(this)}
                              className={id ? "start-timer_description" : "disabled"}>
                            <span>
                                {description || locales.NO_DESCRIPTION}
                            </span>
                            <div style={project ? {color: project.color} : {}}
                                 className={project ?
                                    "time-entry-project" : "disabled"}>
                                <div className="time-entry__project-wrapper">
                                    <div style={project ? {background: project.color} : {}} className="dot"></div>
                                    <span className="time-entry__project-name" >{project ? project.name : ""}{task ? ": " + task.name : ""}</span>
                                </div>
                                <span className="time-entry__client-name">
                                    {project && project.clientName ? " - " + project.clientName : ""}    
                                </span>
                            </div>
                        </div>
                        <input className={!id ? "start-timer_description-input" : "disabled"}
                               placeholder={locales.WHAT_ARE_YOU_WORKING_ON}
                               onChange={this.setDescription.bind(this)}
                               id="description"
                               onKeyDown={this.onKey.bind(this)}
                        />
                    </span>
                   <span className={this.props.mode === 'manual' ? 'start-timer-description' : 'disabled'}>
                        <input className={"start-timer_description-input" }
                               id="duration"
                               placeholder={locales.ENTER_TIME}
                               onChange={this.setDuration.bind(this)}
                               onKeyDown={this.onKey.bind(this)}/>
                   </span>
                   <button className={!id && this.props.mode === 'timer' ?
                                        "start-timer_button-start" : "disabled"}
                           onClick={this.startNewEntry}>
                        <span>{locales.START}</span>
                   </button>
                   <button className={id && this.props.mode === 'timer' ?
                                        "start-timer_button-red" : "disabled"}
                           onClick={this.checkRequiredFields.bind(this)}>
                       <span className="button_timer">
                           {this.state.time}
                       </span>
                       <span className="button_stop">
                        {locales.STOP}
                       </span>
                   </button>
                   <button className={this.props.mode === 'manual' ? "start-timer_button-start" : "disabled"} onClick={this.goToEditManual.bind(this)}>
                       <span>{locales.ADD_TIME}</span>
                   </button>
               </div>
           </div>
        )
    }
}

export default StartTimer;
