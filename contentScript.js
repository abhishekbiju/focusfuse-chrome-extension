(() => {
    let youtubeLeftControls, youtubePlayer;
    let currentVideo = "";

    chrome.runtime.onMessgge.addListener((obj, sender, responce) => {
        const { type, value, videoId } = obj;
        if (type === "NEW") {
            currentVideo = videoId;
            newVideoLoaded();
        }
    })
})();
