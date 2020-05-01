Array.prototype.sample = function(){
    return this[Math.floor(Math.random()*this.length)];
}

function QuestionInfo(question, group, container, use_buttons) {
    this.question = question;
    this.group = group;
    this.container = container;
    this.use_buttons = use_buttons;
}

function Randomizer(use_buttons=true, max_same_items = 2, randomize_algorithm='general', debug=false)
{
    this.questions = [];
    this.use_buttons = use_buttons;
    this.n = 0
    this.algorithm = randomize_algorithm;
    this.max_same_items = max_same_items;
    this.debug = debug

    this.addQuestion = function (q, group, use_buttons=undefined) {
        let container = jQuery("#"+q.questionId);
        container.hide();

        if(use_buttons === undefined)
            use_buttons = this.use_buttons

        let info = new QuestionInfo(q, group, container, use_buttons);
        this.questions.push(info);
        this._add_flow_control(info);
    }

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

    this.randomize = function () {
        if(this.algorithm === 'general')
            this.randomize_general();
    }

    this.randomize_general = function (randomize_attempt = 0) {
        if(randomize_attempt > 10)
        {
            alert("Could not shuffle questions! This is most likely because there is no valid order to be made with the current max_same_items value!")
            return;
        }

        let c = this.questions.slice();
        let numItems = c.length;
        let nq = [];
        let lastGroup = undefined;
        let numOfLastGroup = 0;
        let attempts = 0;

        while (c.length > 0) {
            let el = c.sample();

            // Re-try if we have more attempts than twice all the questions.
            // In this case, the randomize algorithm has made previous choices which prohibit finishing.
            if (attempts === (numItems*2))
            {
                if(this.debug)
                    console.log("Starting new attempt!");
                this.randomize_general(randomize_attempt + 1);
                return;
            }

            if (el.group !== lastGroup || (el.group === lastGroup && numOfLastGroup < this.max_same_items))
            {
                nq.push(el);
                c.splice(c.indexOf(el), 1);
                if(el.group !== lastGroup)
                {
                    numOfLastGroup = 1;
                }
                else
                {
                    numOfLastGroup += 1 ;
                }
                lastGroup = el.group;
                attempts = 0;
            }
            else
            {
                attempts += 1;
                if(this.debug)
                    console.log('Rejecting item from group')
            }
        }

        this.questions = nq;
    }

    this.randomize_zep = function () {
        // NOT IMPLEMENTED
    }

    this.start = function () {
        this.randomize();
        if(this.debug)
            this._print_chosen_order()
        this.step();
    }

    this._print_chosen_order = function() {
        console.log("Chosen order:");
        this.questions.forEach(el => console.log("QuestionId: " + el.question.questionId + "; Group: " +el.group));
        console.log("End");
    }

    this.step = function () {
        // Hide the last question, if there is any.
        if(this.n > 0)
        {
            let last_question = this.questions[this.n - 1]
            last_question.container.hide();
        }
        // Do nothing if our next index is one above the index of the last question
        if(this.questions.length > this.n) {
            let q = this.questions[this.n]
            this.n += 1;

            jQuery("#"+q.question.questionId).show();

            // Note, while this.n is an index, we can compare this with length as it's already incremented by 1
            if(this.questions.length === this.n)
            {
                q.question.showNextButton();
                if(!this.on_question_click) {
                    q.container.find(".Buttons").hide();
                }
            }

            return q
        }
        return undefined
    }
}