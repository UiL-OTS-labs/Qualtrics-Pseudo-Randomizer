// This adds a sample() method to arrays, to randomly select a random element of the array.
Array.prototype.sample = function(){
    return this[Math.floor(Math.random()*this.length)];
}

/**
 * Object to hold all data needed for a question. You should not use this yourself, it's created by the Randomizer.
 * @class
 * @param question {QuestionData} The Qualtrics API object for the question
 * @param group {string} The group this question belongs to
 * @param container {Element} The jQuery Element for the div containing this question
 * @param use_buttons {boolean} If this question should use buttons. If false, it will go to the next question in click
 */
function QuestionInfo(question, group, container, use_buttons) {
    this.question = question;
    this.group = group;
    this.container = container;
    this.use_buttons = use_buttons;
}

/**
 * This is the main randomizer class.
 * @class
 * @param max_same_items {int} The max number of successive questions with the same group. Default: 2
 * @param use_buttons {boolean} If by default, the questions should get a 'next question' button. If false, the next
 * question will be loaded when a question is clicked. Can be overridden on a per-question basis. Default: true
 * @param randomize_algorithm {string} The algorithm to be used. (Only general is supported at this time). Default: general
 * @param debug {boolean} If true, it will log debug info to the console. Default: false
 */
function Randomizer(max_same_items = 2, use_buttons=true, randomize_algorithm='general', debug=false)
{
    // List of all QuestionInfo objects
    this.questions = [];
    // If by default, we should use buttons to advance to the next question
    this.use_buttons = use_buttons;
    // Index of the **last** question.
    this.n = 0
    // The randomize algorithm to use
    this.algorithm = randomize_algorithm;
    // Max number of successive same-group questions
    this.max_same_items = max_same_items;
    // Should be self-explaining
    this.debug = debug

    /**
     * This method is used to register a question. Should be called from Qualtrics.SurveyEngine.addOnload
     * @param q {QuestionData} Qualtrics API object. Just fill in 'this' (without the quotation marks).
     * @param group {string} The group this question belongs to. Can be anything, if used consistently.
     * @param use_buttons {undefined|boolean} (Optional) This can be used to force buttons/no buttons usage for this question. If
     * not provided, the default set for this randomizer will be used.
     */
    this.addQuestion = function (q, group, use_buttons=undefined) {
        // Get the jQuery element which holds this question. Luckily, Qualtrics uses the questionId as the HTML id value.
        let container = jQuery("#"+q.questionId);
        container.hide();

        // If undefined, use the default for this randomizer
        if(use_buttons === undefined)
            use_buttons = this.use_buttons

        // Create the info object and save it
        let info = new QuestionInfo(q, group, container, use_buttons);
        this.questions.push(info);

        // Add the correct buttons/event handlers for progression
        this._add_flow_control(info);
    }

    /**
     * This private method makes sure progressing between questions is possible. There are two options:
     * - Using buttons, which will add a HTML button and register an event handler to said button. (Default behaviour)
     * - Using click, which will use Qualtrics 'questionclick' event to call randomizer.step().
     * Note: the click method only makes sense with a multiple choice question.
     * @param questionInfo {QuestionInfo} The info object for this question
     * @private
     */
    this._add_flow_control = function (questionInfo) {
        let randomizer = this;
        let question = questionInfo.question;

        if(this.questions.length === 1)
            question.hideNextButton();

        if (questionInfo.use_buttons) {
            let buttonContainer = jQuery("<div class='Buttons'></div>");
            let button = jQuery("<input style=\"float:right;\" disabled=\"disabled\" title=\"→\" type=\"button\" name=\"NextButton\" value=\"→\">")

            question.questionclick = function () {
                button.prop('disabled', false);
            };
            button.click(function () {
                randomizer.step();
            });

            buttonContainer.append(button);
            questionInfo.container.append(buttonContainer);
        } else {
            question.hasFired = false;
            question.questionclick = function () {
                if (this.hasFired)
                    return;
                this.hasFired = true
                randomizer.step();
            }
        }
    }

    /**
     * This method will call the selected randomize algorithm and randomize the questions.
     * You really should just call randomizer.start(), which will also call this method.
     */
    this.randomize = function () {
        if(this.algorithm === 'general')
            this._randomize_general();
    }

    /**
     * The normal randomizer algorithm.
     * @param randomize_attempt {int} The number of times already attempted to create a random order.
     * @private
     */
    this._randomize_general = function (randomize_attempt = 0) {
        // Stop after 10 randomize attempts, it's probably hopeless.
        if(randomize_attempt > 10)
        {
            alert("Could not shuffle questions! This is most likely because there is no valid order to be made with the current max_same_items value!")
            return;
        }

        // Copy the questions to avoid meddling with the original list
        let c = this.questions.slice();
        let numItems = c.length;
        // Array to built the new order in.
        let nq = [];
        let lastGroup = undefined;
        let numOfLastGroup = 0;
        // Number of attempts to find a fitting element. (NOT the amount of attempts to create a random order).
        let attempts = 0;

        while (c.length > 0) {
            // Re-try if we have more attempts to find a fitting question than twice all the questions.
            // In this case, the randomize algorithm has made previous choices which prohibit finishing.
            if (attempts === (numItems*2))
            {
                if(this.debug)
                    console.log("Starting new attempt!");
                this._randomize_general(randomize_attempt + 1);
                return;
            }

            // Pick a random item from the original array
            let el = c.sample();

            // If this element belongs to a different group than last OR we haven't reached the limit of successive items
            if (el.group !== lastGroup || (el.group === lastGroup && numOfLastGroup < this.max_same_items))
            {
                // Add it to the order
                nq.push(el);
                // Remove it from the original array
                c.splice(c.indexOf(el), 1);

                // If this group isn't the same as last, reset
                if(el.group !== lastGroup)
                {
                    numOfLastGroup = 1;
                }
                // Otherwise, increase the counter
                else
                {
                    numOfLastGroup += 1 ;
                }
                // Reset these variables to the proper value
                lastGroup = el.group;
                attempts = 0;
            }
            else
            {
                // This element doesn't fit. Count this as an attempt to find a fitting element
                attempts += 1;
                if(this.debug)
                    console.log('Rejecting item from group')
            }
        }

        this.questions = nq;
        if(this.debug)
            this._print_chosen_order()
    }

    this.randomize_zep = function () {
        // NOT IMPLEMENTED
    }

    /**
     * This method will randomize the order, and display the first question.
     * Read: use this to start the questions
     */
    this.start = function () {
        this.randomize();
        this.step();
    }

    /**
     * Debug method to log the final order to console
     * @private
     */
    this._print_chosen_order = function() {
        console.log("Chosen order:");
        this.questions.forEach(el => console.log("QuestionId: " + el.question.questionId + "; Group: " +el.group));
        console.log("End");
    }

    /**
     * This method will display the next question, and enable the Qualtrics next button if it's the last question.
     * @returns {undefined|QuestionInfo} The questionInfo object for the new question
     */
    this.step = function () {
        // Hide the last question, if there is any.
        if(this.n > 0)
        {
            let last_question = this.questions[this.n - 1]
            last_question.container.hide();
        }
        // Do nothing if our next index is one above the index of the last question, we're at the last question
        if(this.questions.length > this.n) {
            // Get the new question and increment n
            let q = this.questions[this.n]
            this.n += 1;

            // Show this question
            jQuery("#"+q.question.questionId).show();

            // Note, while this.n is an index, we can compare this with length as it's already incremented by 1
            if(this.questions.length === this.n)
            {
                // If this is the last question, show Qualtrics' next button and hide our own button if present.
                q.question.showNextButton();
                if(!q.use_buttons) {
                    q.container.find(".Buttons").hide();
                }
            }

            return q
        }
        return undefined
    }
}