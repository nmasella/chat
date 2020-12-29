import { IExchange } from "./Exchange/IExchange.js";
import { Firebase } from "./Exchange/Firebase.js";
import { ICommunication } from "./Communication/ICommunication.js";
import { WebRTC } from "./Communication/WebRTC.js";
import { IPartner } from "./Partner/IPartner.js";
import { IPartners } from "./Partner/IPartners.js";
import { Partner } from "./Partner/Partner.js";
import { Controls } from "./Elements/Controls.js";
import { Screen } from "./Elements/Screen.js";
import { Devices } from "./Elements/Devices.js";
import { Textchat } from "./Elements/Textchat.js";
import { Userinfo } from "./Elements/Userinfo.js";
import { JQueryUtils } from "./Utils/JQuery.js";

export class App{

    room: string;
    yourId: number = Math.floor(Math.random()*1000000000);
    yourName: string;
    exchange: IExchange;
    communication: ICommunication;
    yourVideo: HTMLElement;
    localStream: any;
    localScreenStream: any;
    partners: IPartners = {};
    controls: Controls;
    screen: Screen;
    devices: Devices;
    textchat: Textchat;
    userinfo: Userinfo;

    constructor(){
        this.setRoom();
        console.log("Id: " + this.yourId + " Room: " + this.room);
        this.yourVideo = document.getElementById("yourVideo");
        this.exchange = new Firebase(this.room, this.yourId);
        this.exchange.addReadEvent(this.readMessage);
        this.controls = new Controls(this);
        this.screen = new Screen(this);
        this.devices = new Devices(this);
        this.textchat = new Textchat(this);
        this.userinfo = new Userinfo(this);
        $(window).on("beforeunload", function() { 
            app.hangOut();
        })
        JQueryUtils.addToBigfunction("yourVideoArea");
    }

    run(){ 
        navigator.mediaDevices.enumerateDevices().then(function(deviceInfos){
            app.devices.gotDevices(deviceInfos);
        });
    }

    setRoom(): void{
        if (!location.hash) {
            location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16);
        }
        this.room = location.hash.substring(1);
        window.onhashchange = function() {
            location.reload();
        }
    }

    initialCamera(first: boolean = false) {
        const constraints = {
            audio: {deviceId: this.devices.devicesVueObject.audio ? {exact: this.devices.devicesVueObject.audio} : undefined},
            video: {deviceId: this.devices.devicesVueObject.video ? {exact: this.devices.devicesVueObject.video} : undefined}
        };
        if(this.localStream){
            this.localStream.getTracks().forEach(track => track.stop());
        }
        navigator.mediaDevices.getUserMedia(constraints)
            .then(function(stream){
                // @ts-ignore
                app.yourVideo.srcObject = stream;
                app.localStream = stream;
                if(first){
                    
                    app.callOther();  
                }
                app.controls.initialiseStream();
                app.setStreamToPartners();
            })
            .catch(function(err) {
                alert("Es kann leider nicht auf die Kamera zugegriffen werden!");
            });
    }

    callOther(){
        this.exchange.sendMessage(JSON.stringify({'call': this.yourId}));
    }

    readMessage(sender: number, dataroom: string, msg) {
        if(app !== undefined && app.localStream != undefined){
            console.log("Exchange message from: " + sender)
            console.log(msg)
            if (!(sender in app.partners) || msg.call !== undefined)
            {
                app.addPartner(sender);
            }
            var partnerConnection = app.partners[sender].connection;
            if (msg.call !== undefined)
            {
                app.partners[sender].createOffer();
            }
            else if (msg.closing !== undefined)
            {
                app.partners[sender].closeConnection();
                delete app.partners[sender];
            }
            else if (msg.ice !== undefined)
            {
                partnerConnection.addIceCandidate(new RTCIceCandidate(msg.ice));
            }
            else if (msg.sdp.type === "offer")
            {
                partnerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp)) 
                    .then(function(){ 
                        return partnerConnection.createAnswer();
                    })
                    .then(function(answer){
                        return partnerConnection.setLocalDescription(answer);
                    })
                    .then(function(){
                        app.exchange.sendMessage(JSON.stringify({'sdp': partnerConnection.localDescription}), sender);
                    });
            }
            else if (msg.sdp.type === "answer")
            {
                partnerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            }
        }
    }

    addPartner(partnerId: number){
        var cla = this;
        if(partnerId in app.partners){
            this.partners[partnerId].closeConnection();
            delete this.partners[partnerId];
        }
        this.partners[partnerId] = new Partner(partnerId, this.exchange, this.devices, this.textchat);
        this.setStreamToPartner(this.partners[partnerId], true);
        this.partners[partnerId].sendMessage({type: Userinfo.userinfoMessageType, message: {name: this.yourName}});
    }

    setStreamToPartners(){
        for (var id in this.partners) {
            this.setStreamToPartner(this.partners[id]);
        }
    }

    setStreamToPartner(partner: IPartner, initial: boolean = false){
        var videoTrack = !this.screen.onScreenMode() ? this.localStream.getVideoTracks()[0] : this.localScreenStream.getVideoTracks()[0];
        var audioTrack = this.localStream.getAudioTracks()[0];
        this.setTrackToPartner(partner, this.localStream, videoTrack);
        this.setTrackToPartner(partner, this.localStream, audioTrack);
    }

    setTrackToPartner(partner: IPartner, stream: any, track: any){
        var sender = partner.connection.getSenders().find(function(s) {
            return s.track.kind == track.kind;
        });
        if(sender){
            sender.replaceTrack(track);
        } else {
            partner.connection.addTrack(track, stream);
        }
    }

    sendMessageToAllPartners(message: any){
        for (var id in this.partners) {
            if(this.partners[id]){
                this.partners[id].sendMessage(message);
            }
        }
    }

    sidebarToogle(open: boolean){
        $(".maincontainer").toggleClass("opensidebar"); 
        this.textchat.scrollToBottom();
    }

    hangOut(){
        this.exchange.sendMessage(JSON.stringify({'closing': this.yourId}));
        this.exchange.closeConnection();
        for (var id in this.partners) {
            if(this.partners[id]){
                this.partners[id].connection.close();
            }
        }
        $("#video-area .video-item-partner").remove();
    }
}

var app = new App();
app.run();